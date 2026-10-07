// Run: npx tsx --test lib/interview-reminders.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKIN_WINDOW_MS,
  checkInDue,
  checkInReplyText,
  looksLikeCheckIn,
  formatShortTime,
  got1hText,
  oneHourText,
  startingNowText,
  classifyAttendance,
  formatInterviewTime,
  isReminderEligible,
  noShowEmail,
  noShowEmailDue,
  pickReminder,
  reminderEmail,
  sentReminders,
  type ReminderKind,
} from "./interview-reminders";
import { normalizePhone, sendInterviewText } from "./sms";

const MIN = 60_000;
const HOUR = 60 * MIN;
const START = Date.parse("2026-10-08T18:00:00.000Z");
const none = new Set<ReminderKind>();

test("pickReminder: 24h window is 23h to 25h before", () => {
  assert.equal(pickReminder(START, START - 25 * HOUR - MIN, none), null);
  assert.equal(pickReminder(START, START - 25 * HOUR, none), "24h");
  assert.equal(pickReminder(START, START - 24 * HOUR, none), "24h");
  assert.equal(pickReminder(START, START - 23 * HOUR, none), "24h");
  assert.equal(pickReminder(START, START - 22 * HOUR, none), null);
});

test("pickReminder: 1h text window is 59 to 61 min before", () => {
  assert.equal(pickReminder(START, START - 62 * MIN, none), null);
  assert.equal(pickReminder(START, START - 61 * MIN, none), "1h");
  assert.equal(pickReminder(START, START - 60 * MIN, none), "1h");
  assert.equal(pickReminder(START, START - 59 * MIN, none), "1h");
  assert.equal(pickReminder(START, START - 58 * MIN, none), null);
  assert.equal(pickReminder(START, START - 60 * MIN, new Set(["1h"])), null);
});

test("pickReminder: starting-now text goes out at the start, never before", () => {
  assert.equal(pickReminder(START, START - 30 * 1000, none), null);
  assert.equal(pickReminder(START, START, none), "now");
  assert.equal(pickReminder(START, START + 2 * MIN, none), "now");
  assert.equal(pickReminder(START, START + 3 * MIN, none), null);
});

test("pickReminder: already sent kinds are skipped, and no start means nothing", () => {
  assert.equal(pickReminder(START, START - 24 * HOUR, new Set(["24h"])), null);
  assert.equal(pickReminder(START, START - HOUR, new Set(["24h"])), "1h");
  assert.equal(pickReminder(0, START, none), null);
});

test("every 1-minute tick hits each window at least once", () => {
  for (let offset = 0; offset < 60; offset += 15) {
    const hits = new Set<string>();
    for (let t = START - 26 * HOUR + offset * 1000; t <= START + 10 * MIN; t += MIN) {
      const k = pickReminder(START, t, none);
      if (k) hits.add(k);
    }
    assert.deepEqual([...hits].sort(), ["1h", "24h", "now"]);
  }
});

test("sentReminders ignores markers from a booking before a reschedule", () => {
  const iso = "2026-10-08T18:00:00.000000Z";
  const app = {
    interview_reminders_start: iso,
    interview_reminder_24h_sent_at: { toMillis: () => 1 },
    interview_reminder_1h_sent_at: null,
  };
  assert.deepEqual([...sentReminders(app, iso)], ["24h"]);
  assert.deepEqual([...sentReminders(app, "2026-10-09T18:00:00.000000Z")], []);
});

test("isReminderEligible skips denied/withdrawn/accepted and missing email", () => {
  assert.equal(isReminderEligible({ status: "booked", email: "a@b.co" }), true);
  for (const status of ["denied", "withdrawn", "accepted", "rejected"]) {
    assert.equal(isReminderEligible({ status, email: "a@b.co" }), false);
  }
  assert.equal(isReminderEligible({ status: "booked", email: "" }), false);
});

test("formatInterviewTime uses the invitee timezone, else ET + UTC", () => {
  assert.equal(formatInterviewTime(START, "America/Chicago"), "Thursday, October 8 at 1:00 PM CDT");
  assert.equal(formatInterviewTime(START), "Thursday, October 8 at 2:00 PM EDT (6:00 PM UTC)");
  assert.equal(formatInterviewTime(START, "Not/AZone"), "Thursday, October 8 at 2:00 PM EDT (6:00 PM UTC)");
});

test("reminder copy: links, what to bring, sign-off, no em dashes", () => {
  for (const kind of ["24h", "1h", "now"] as const) {
    const m = reminderEmail(kind, { first: "Sam", when: "x", joinUrl: "https://zoom.us/j/1", rescheduleUrl: "https://calendly.com/r" });
    assert.match(m.text, /^Hi Sam,/);
    assert.match(m.text, /https:\/\/zoom\.us\/j\/1/);
    assert.match(m.text, /https:\/\/calendly\.com\/r/);
    assert.match(m.text, /phone, charged, a quiet spot with good light/);
    assert.match(m.text, /McKenzie\nCreator Coordinator, KESHAH$/);
    assert.ok(!m.text.includes("—") && !m.subject.includes("—"));
  }
  const noLinks = reminderEmail("1h", { first: "Sam", when: "x" });
  assert.match(noLinks.text, /Calendly confirmation email/);
  assert.ok(!noLinks.text.includes("reschedule"));
});

const session = { slug: "oct-8", starts_at_ms: START };

test("classifyAttendance: booked into the slot but never opened = no-show", () => {
  assert.equal(classifyAttendance({ calendly_event_start_time: "2026-10-08T18:00:00.000000Z" }, session), "no_show");
  // within ±30 min still counts as this slot
  assert.equal(classifyAttendance({ calendly_event_start_time: "2026-10-08T18:30:00.000000Z" }, session), "no_show");
});

test("classifyAttendance: opened this session's page = attendee", () => {
  assert.equal(
    classifyAttendance(
      { calendly_event_start_time: "2026-10-08T18:00:00.000000Z", interview_session: "oct-8", interview_opened_at: { toMillis: () => 1 } },
      session,
    ),
    "attendee",
  );
  // showed up without a booking
  assert.equal(classifyAttendance({ interview_session: "oct-8", interview_opened_at: "2026-10-08T18:05:00Z" }, session), "attendee");
});

test("classifyAttendance: opened a different session's page still a no-show here", () => {
  assert.equal(
    classifyAttendance(
      { calendly_event_start_time: "2026-10-08T18:00:00.000000Z", interview_session: "oct-1", interview_opened_at: "x" },
      session,
    ),
    "no_show",
  );
});

test("noShowEmailDue: once, from 30 min after start until close, not after session follow-ups", () => {
  const s = { starts_at_ms: START, closes_at_ms: START + 24 * HOUR };
  assert.equal(noShowEmailDue({}, s, START + 29 * MIN), false);
  assert.equal(noShowEmailDue({}, s, START + 30 * MIN), true);
  assert.equal(noShowEmailDue({}, s, START + 5 * HOUR), true);
  assert.equal(noShowEmailDue({}, s, START + 24 * HOUR), false);
  assert.equal(noShowEmailDue({ interview_noshow_email_sent_at: "x" }, s, START + HOUR), false);
  assert.equal(noShowEmailDue({ interview_followup_1_sent_at: "x" }, s, START + HOUR), false);
  assert.equal(noShowEmailDue({ interview_video_submitted_at: "x" }, s, START + HOUR), false);
});

test("noShowEmail: recording line only when set", () => {
  const link = "https://www.keshah.com/interview/video?email=a%40b.co";
  const withRec = noShowEmail({ first: "Sam", link, deadline: "6:00 PM ET on Thursday, Oct 8", recordingUrl: "https://loom.com/x" });
  assert.match(withRec.text, /https:\/\/loom\.com\/x/);
  assert.match(withRec.text, /about 10 minutes/);
  assert.ok(withRec.text.includes(link));
  const without = noShowEmail({ first: "Sam", link, deadline: "6:00 PM ET on Thursday, Oct 8", recordingUrl: null });
  assert.ok(!without.text.includes("recording"));
  assert.ok(!withRec.text.includes("—"));
});

test("normalizePhone: E.164 or US 10-digit, else null", () => {
  assert.equal(normalizePhone("(555) 555-5555"), "+15555555555");
  assert.equal(normalizePhone("(055) 555-5555"), null);
  assert.equal(normalizePhone("(347) 331-2820"), "+13473312820");
  assert.equal(normalizePhone("1-347-331-2820"), "+13473312820");
  assert.equal(normalizePhone("+44 7700 900123"), "+447700900123");
  assert.equal(normalizePhone("12345"), null);
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(undefined), null);
});

test("sendInterviewText skips when HiBlue isn't configured", async () => {
  const saved = { k: process.env.HIUBLUE_API_KEY, l: process.env.HIUBLUE_LINE };
  delete process.env.HIUBLUE_API_KEY;
  delete process.env.HIUBLUE_LINE;
  assert.deepEqual(await sendInterviewText({ to: "+13473312820", text: "hi" }), { skipped: "not configured" });
  if (saved.k !== undefined) process.env.HIUBLUE_API_KEY = saved.k;
  if (saved.l !== undefined) process.env.HIUBLUE_LINE = saved.l;
});

// ---------------------------------------------------------------- 1h check-in

test("formatShortTime: invitee zone as CT/PT, else ET", () => {
  assert.equal(formatShortTime(START, "America/Chicago"), "1:00 PM CT");
  assert.equal(formatShortTime(START, "America/Los_Angeles"), "11:00 AM PT");
  assert.equal(formatShortTime(START), "2:00 PM ET");
  assert.equal(formatShortTime(START, "Not/AZone"), "2:00 PM ET");
});

test("oneHourText: intro, time, check-in ask, no link, no em dashes", () => {
  const t = oneHourText("Sam", "5:00 PM CT");
  assert.equal(t, "Hi Sam, this is McKenzie, creator coordinator at KESHAH.\n\nYour group interview starts in 1 hour, at 5:00 PM CT.\n\nReply with your full name to check in.");
  assert.ok(!/https?:/.test(t) && !t.includes("\u2014"));
});

test("startingNowText drops McKenzie's intro only after the 1h text", () => {
  const link = "https://zoom.us/j/1";
  assert.equal(startingNowText("Sam", link, true), `Hi Sam,\n\nWe're waiting for you to start the group interview.\n\nHere's the link:\n${link}`);
  assert.match(startingNowText("Sam", link), /^Hi Sam, this is McKenzie, creator coordinator at KESHAH\.\n\nWe're waiting/);
  assert.match(startingNowText("Sam", link, false), /this is McKenzie/);
});

test("got1hText only counts the 1h text for the current booking", () => {
  const iso = "2026-10-08T18:00:00.000000Z";
  assert.equal(got1hText({ interview_reminder_1h_text_sent_at: "x", interview_reminders_start: iso }, iso), true);
  assert.equal(got1hText({ interview_reminder_1h_text_sent_at: "x", interview_reminders_start: "2026-10-07T18:00:00Z" }, iso), false);
  assert.equal(got1hText({ interview_reminder_1h_sent_at: "x", interview_reminders_start: iso }, iso), false);
});

test("checkInReplyText has the join link and time", () => {
  assert.equal(checkInReplyText("Sam", "5:00 PM CT", "https://zoom.us/j/1"), "Thanks Sam, you're checked in.\n\nHere's the link for 5:00 PM CT:\nhttps://zoom.us/j/1");
});

test("checkInDue: only after the 1h text, inside the window, before the start, once per booking", () => {
  const iso = "2026-10-08T18:00:00.000Z";
  const base = {
    status: "booked",
    email: "a@b.co",
    calendly_event_start_time: iso,
    interview_reminders_start: iso,
    interview_reminder_1h_text_sent_at: "x",
  };
  assert.equal(checkInDue(base, START - 55 * MIN, START - 55 * MIN), true);
  assert.equal(checkInDue(base, START - 1 * MIN, START - 1 * MIN + 5000), true);
  // too early (more than 70 min before) or after the start
  assert.equal(checkInDue(base, START - CHECKIN_WINDOW_MS - MIN, START - 50 * MIN), false);
  assert.equal(checkInDue(base, START + MIN, START + MIN), false);
  // reply in time but we only process it after the start: no link sent
  assert.equal(checkInDue(base, START - 5 * MIN, START + MIN), false);
  // no 1h text, or 1h text for an older booking
  const { interview_reminder_1h_text_sent_at: _drop, ...no1h } = base;
  void _drop;
  assert.equal(checkInDue(no1h, START - 30 * MIN, START - 30 * MIN), false);
  assert.equal(checkInDue({ ...base, interview_reminders_start: "2026-10-07T18:00:00.000Z" }, START - 30 * MIN, START - 30 * MIN), false);
  // already checked in for this booking
  assert.equal(checkInDue({ ...base, interview_checked_in_at: "x", interview_checked_in_for: iso }, START - 30 * MIN, START - 30 * MIN), false);
  // checked in for an older booking: this one still counts
  assert.equal(checkInDue({ ...base, interview_checked_in_at: "x", interview_checked_in_for: "2026-10-07T18:00:00.000Z" }, START - 30 * MIN, START - 30 * MIN), true);
  // denied applicants never check in
  assert.equal(checkInDue({ ...base, status: "denied" }, START - 30 * MIN, START - 30 * MIN), false);
});

test("looksLikeCheckIn: name or short yes/here counts; questions and other text don't", () => {
  const name = "Jamie Rivera";
  for (const t of ["Jamie Rivera", "jamie rivera.", "Jamie", "Rivera", "It's Jamie Rivera", "yes", "Here!", "checked in", "I'm here", "Yes I'll be there", "ok"]) {
    assert.equal(looksLikeCheckIn(t, name), true, t);
  }
  for (const t of [
    "can I reschedule?",
    "running late",
    "Jamie running late",
    "Jamie?",
    "who is this",
    "I can't make it",
    "no",
    "Hi, I wanted to ask about the interview time because I have class",
    "Sam Smith", // someone else's name
    "12345",
    "",
  ]) {
    assert.equal(looksLikeCheckIn(t, name), false, t);
  }
});
