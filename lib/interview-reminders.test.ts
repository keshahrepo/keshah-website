// Run: npx tsx --test lib/interview-reminders.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
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

test("pickReminder: 1h window is 50 to 70 min before", () => {
  assert.equal(pickReminder(START, START - 71 * MIN, none), null);
  assert.equal(pickReminder(START, START - 70 * MIN, none), "1h");
  assert.equal(pickReminder(START, START - 50 * MIN, none), "1h");
  assert.equal(pickReminder(START, START - 49 * MIN, none), null);
});

test("pickReminder: starting-now window is -2 to +6 min around the start", () => {
  assert.equal(pickReminder(START, START - 3 * MIN, none), null);
  assert.equal(pickReminder(START, START - 2 * MIN, none), "now");
  assert.equal(pickReminder(START, START, none), "now");
  assert.equal(pickReminder(START, START + 6 * MIN, none), "now");
  assert.equal(pickReminder(START, START + 7 * MIN, none), null);
});

test("pickReminder: already sent kinds are skipped, and no start means nothing", () => {
  assert.equal(pickReminder(START, START - 24 * HOUR, new Set(["24h"])), null);
  assert.equal(pickReminder(START, START - HOUR, new Set(["24h"])), "1h");
  assert.equal(pickReminder(0, START, none), null);
});

test("every 5-minute tick hits each window at least once", () => {
  for (let offset = 0; offset < 5; offset++) {
    const hits = new Set<string>();
    for (let t = START - 26 * HOUR + offset * MIN; t <= START + 10 * MIN; t += 5 * MIN) {
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
