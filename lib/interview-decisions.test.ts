// Run: npx tsx --test lib/interview-decisions.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoDenyDue,
  cancelDecision,
  denialEmail,
  denialEmailDue,
  hasInterviewVideo,
  isDecided,
  looksLikeSamePerson,
  outsideUsTimezone,
  statusAfterCancel,
} from "./interview-decisions";
import { endOfNextEasternDayMs } from "./interview";
import { normalizePhone, PHONE_HINT } from "./phone";
import { smsKeyword } from "./applicant-inbox";

const MIN = 60_000;
// Thu Oct 15 2026, 6:00 PM EDT
const START = "2026-10-15T22:00:00.000000Z";
const startMs = Date.parse(START);
const closesMs = endOfNextEasternDayMs(startMs); // Fri Oct 16, 11:59 PM ET
const session = { starts_at_ms: startMs, closes_at_ms: closesMs };

// ---------------------------------------------------------------- denial email

test("denial email: only for people who sent a video, once", () => {
  assert.equal(denialEmailDue({ email: "a@x.com", interview_video_submitted_at: "t" }), true);
  assert.equal(denialEmailDue({ email: "a@x.com", video_object_path: "careers-applications/x.mp4" }), true);
  // No-show: never sent a video.
  assert.equal(denialEmailDue({ email: "a@x.com", interview_checked_in_at: "t" }), false);
  assert.equal(denialEmailDue({ email: "a@x.com", video_object_path: "  " }), false);
  // Already sent (e.g. Reopen then Deny again).
  assert.equal(denialEmailDue({ email: "a@x.com", interview_video_submitted_at: "t", denial_email_sent_at: "t" }), false);
  assert.equal(denialEmailDue({ interview_video_submitted_at: "t" }), false, "no email address");
});

test("denial email copy is the founder's, from McKenzie, plain text", () => {
  const e = denialEmail("Sam");
  assert.equal(e.subject, "Your KESHAH application");
  assert.ok(e.text.startsWith("Hi Sam,\n\nThank you for taking the time to interview with us and film your video test. We really appreciated it."));
  assert.match(e.text, /we've decided not to move forward with your application this time\./);
  assert.match(e.text, /We wish you all the best\.\n\nBest,\nMcKenzie\nCreator Coordinator, KESHAH$/);
  assert.ok(!e.text.includes("—"), "no em dashes");
  assert.ok(denialEmail("").text.startsWith("Hi there,"));
});

// ---------------------------------------------------------------- auto-deny

test("auto-deny: no video after the deadline, booked into this session", () => {
  const app = { status: "booked", calendly_event_start_time: START };
  assert.equal(autoDenyDue(app, session, closesMs - 1), false, "deadline not passed yet");
  assert.equal(autoDenyDue(app, session, closesMs), true);
  assert.equal(autoDenyDue({ ...app, status: "completed" }, session, closesMs), true);
  // Attendee without a booking (created on the interview page).
  assert.equal(autoDenyDue({ status: "booked", interview_session: "oct-15-6pm" }, session, closesMs), true);
});

test("auto-deny never touches decided, canceled, rescheduled, video senders or flagged duplicates", () => {
  const app = { status: "booked", calendly_event_start_time: START };
  for (const status of ["accepted", "denied", "withdrawn", "rejected"]) {
    assert.equal(autoDenyDue({ ...app, status }, session, closesMs + MIN), false, status);
  }
  assert.equal(autoDenyDue({ status: "awaiting_booking", interview_session: "oct-15-6pm" }, session, closesMs), false, "canceled booking");
  assert.equal(autoDenyDue({ ...app, interview_video_submitted_at: "t" }, session, closesMs), false);
  assert.equal(autoDenyDue({ ...app, video_object_path: "careers-applications/a.mp4" }, session, closesMs), false);
  // Rescheduled to next week (still tagged to this session from opening its page).
  const later = new Date(startMs + 7 * 24 * 60 * MIN).toISOString();
  assert.equal(autoDenyDue({ ...app, calendly_event_start_time: later, interview_session: "oct-15-6pm" }, session, closesMs), false);
  // Inside the slot tolerance still counts as this session.
  assert.equal(autoDenyDue({ ...app, calendly_event_start_time: new Date(startMs + 15 * MIN).toISOString() }, session, closesMs), true);
  assert.equal(autoDenyDue({ ...app, interview_possible_duplicate_id: "X" }, session, closesMs), false);
  assert.equal(autoDenyDue(app, { starts_at_ms: 0, closes_at_ms: 0 }, closesMs), false, "no real session");
});

test("isDecided / hasInterviewVideo", () => {
  assert.equal(isDecided("accepted"), true);
  assert.equal(isDecided("withdrawn"), true);
  assert.equal(isDecided("booked"), false);
  assert.equal(isDecided(undefined), false);
  assert.equal(hasInterviewVideo({}), false);
});

// ---------------------------------------------------------------- Calendly cancels

test("cancel: a reschedule is ignored, the matching booking is cleared", () => {
  const app = { status: "booked", calendly_event_start_time: START, calendly_event_uri: "https://api.calendly.com/scheduled_events/A" };
  assert.equal(cancelDecision(app, { rescheduled: true, event_uri: "https://api.calendly.com/scheduled_events/A" }), "reschedule");
  assert.equal(cancelDecision(app, { rescheduled: false, event_uri: "https://api.calendly.com/scheduled_events/A" }), "clear");
  assert.equal(cancelDecision(app, { event_uri: "https://api.calendly.com/scheduled_events/A" }), "clear", "rescheduled absent");
  // A late cancel for an older booking doesn't wipe the new one.
  assert.equal(cancelDecision(app, { event_uri: "https://api.calendly.com/scheduled_events/OLD" }), "other_booking");
  assert.equal(cancelDecision({ status: "awaiting_booking" }, { event_uri: "x" }), "no_booking");
});

test("cancel: docs without an event URI match on the start time", () => {
  const app = { status: "booked", calendly_event_start_time: START };
  assert.equal(cancelDecision(app, { start_time: "2026-10-15T22:00:00Z" }), "clear");
  assert.equal(cancelDecision(app, { start_time: "2026-10-14T22:00:00Z" }), "other_booking");
  assert.equal(cancelDecision(app, {}), "clear");
});

test("reschedule = canceled(rescheduled) then created: only the created one changes the doc", () => {
  // Simulate the webhook's two events on one doc.
  let doc: Record<string, unknown> = { status: "booked", calendly_event_start_time: START, calendly_event_uri: "E1" };
  const d1 = cancelDecision(doc, { rescheduled: true, event_uri: "E1" });
  assert.equal(d1, "reschedule");
  const newStart = "2026-10-16T22:00:00.000000Z";
  doc = { ...doc, status: "booked", calendly_event_start_time: newStart, calendly_event_uri: "E2" };
  // A stray non-reschedule cancel for E1 arriving after the new booking is ignored.
  assert.equal(cancelDecision(doc, { rescheduled: false, event_uri: "E1" }), "other_booking");
  assert.equal(doc.calendly_event_start_time, newStart);
});

test("status after a cancel: back to booking unless decided or video sent", () => {
  assert.equal(statusAfterCancel({ status: "booked" }), "awaiting_booking");
  assert.equal(statusAfterCancel({ status: "denied" }), null);
  assert.equal(statusAfterCancel({ status: "accepted" }), null);
  assert.equal(statusAfterCancel({ status: "booked", interview_video_submitted_at: "t" }), null);
});

// ---------------------------------------------------------------- mistyped emails

test("looks like the same person: same full name, or an email a typo away", () => {
  const booked = { full_name: "Maya Lopez", email: "maya.lopez@gmail.com" };
  assert.equal(looksLikeSamePerson({ full_name: "maya  lopez", email: "other@x.com" }, booked), true);
  assert.equal(looksLikeSamePerson({ full_name: "Someone Else", email: "maya.lopez@gmial.com" }, booked), true);
  assert.equal(looksLikeSamePerson({ full_name: "Someone Else", email: "mayalopez@gmail.co" }, booked), true);
  assert.equal(looksLikeSamePerson({ full_name: "Maya", email: "m@x.com" }, booked), false, "first name alone isn't enough");
  assert.equal(looksLikeSamePerson({ full_name: "Sam Lee", email: "sam@x.com" }, booked), false);
});

// ---------------------------------------------------------------- phone + STOP

test("phone rules used by the apply form and the server", () => {
  assert.equal(normalizePhone("(212) 555-0101"), "+12125550101");
  assert.equal(normalizePhone("1 212 555 0101"), "+12125550101");
  assert.equal(normalizePhone("+44 7911 123456"), "+447911123456");
  // International without "+": we can't tell, so the form asks for the country code.
  assert.equal(normalizePhone("44 7911 123456"), null);
  assert.equal(normalizePhone("07911 123456"), null);
  assert.equal(normalizePhone("555-0101"), null);
  assert.equal(PHONE_HINT, "Include your country code, e.g. +1 for the US");
});

test("STOP / START replies", () => {
  for (const t of ["STOP", "stop", " Stop. ", "UNSUBSCRIBE", "Unsubscribe!", "stopall", "QUIT", "end"]) assert.equal(smsKeyword(t), "stop", t);
  for (const t of ["START", "unstop"]) assert.equal(smsKeyword(t), "start", t);
  for (const t of ["stop texting me please", "Sam Lee", "yes", "can I reschedule?", "cancel"]) assert.equal(smsKeyword(t), null, t);
});

test("outsideUsTimezone flags clear non-US zones only", () => {
  for (const z of ["America/New_York", "America/Chicago", "America/Los_Angeles", "America/Indiana/Indianapolis", "Pacific/Honolulu", "Etc/GMT+5", "", null])
    assert.equal(outsideUsTimezone(z), false, String(z));
  for (const z of ["Africa/Nairobi", "Africa/Cairo", "Asia/Jerusalem", "Europe/London", "America/Toronto"])
    assert.equal(outsideUsTimezone(z), true, z);
});
