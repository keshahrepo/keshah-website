// Pure helpers for group-interview reminders and no-show follow-ups.
// No Firestore here, so it's unit tested in interview-reminders.test.ts.
//
// Reminders (app/api/interview/reminders, every 5 min) go to applicants with
// a Calendly booking in the future:
//   24h   when 23h to 25h remain
//   1h    when 50 to 70 min remain
//   now   from 2 min before the start to 6 min after
// Each is sent at most once per booking. The sent markers are tied to the
// booked start time (interview_reminders_start) so a reschedule gets a fresh
// set.
//
// No-shows (app/api/interview/follow-up): booked into the session's slot but
// never opened that session's interview page. They get one "sorry we missed
// you" email with the always-open video link instead of the session-link
// follow-ups.

import { CREATOR_FROM_NAME, CREATOR_SIGNOFF } from "./creators/invite";

export { CREATOR_FROM_NAME };

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export type ReminderKind = "24h" | "1h" | "now";
export const REMINDER_KINDS: ReminderKind[] = ["24h", "1h", "now"];

export const REMINDER_FIELDS: Record<ReminderKind, string> = {
  "24h": "interview_reminder_24h_sent_at",
  "1h": "interview_reminder_1h_sent_at",
  now: "interview_reminder_now_sent_at",
};
export const REMINDER_START_FIELD = "interview_reminders_start";
export const REMINDER_NOW_TEXT_FIELD = "interview_reminder_now_text_sent_at";
export const NOSHOW_EMAIL_FIELD = "interview_noshow_email_sent_at";
export const NOSHOW_TEXT_FIELD = "interview_noshow_text_sent_at";

/** [minRemaining, maxRemaining] in ms, inclusive. Negative = after start. */
export const REMINDER_WINDOWS: Record<ReminderKind, [number, number]> = {
  "24h": [23 * HOUR, 25 * HOUR],
  "1h": [50 * MIN, 70 * MIN],
  // Cron runs every minute: the text goes out in the first minute after the
  // start time (a second minute only as a retry if the first send failed).
  now: [-2 * MIN, 0],
};

/** How far back / ahead the cron needs to look for bookings. */
export const REMINDER_LOOKBACK_MS = 3 * MIN;
export const REMINDER_LOOKAHEAD_MS = 25 * HOUR;

/** Statuses that never get reminders. */
const INACTIVE = new Set(["denied", "rejected", "withdrawn", "accepted"]);

export function isReminderEligible(app: Record<string, unknown>): boolean {
  if (INACTIVE.has(String(app.status ?? ""))) return false;
  return !!String(app.email ?? "").trim();
}

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false && v !== "";
}

/**
 * Which reminders already went out for THIS booking. Markers written for an
 * earlier start time (before a reschedule) don't count.
 */
export function sentReminders(app: Record<string, unknown>, startIso: string): Set<ReminderKind> {
  const out = new Set<ReminderKind>();
  const forStart = app[REMINDER_START_FIELD];
  // Markers written before we tracked the start (shouldn't exist, but be
  // safe and treat them as for the current booking).
  if (forStart !== undefined && forStart !== null && forStart !== startIso) return out;
  for (const k of REMINDER_KINDS) if (present(app[REMINDER_FIELDS[k]])) out.add(k);
  return out;
}

/** The reminder due right now, or null. Windows never overlap. */
export function pickReminder(startMs: number, nowMs: number, sent: Set<ReminderKind>): ReminderKind | null {
  if (!startMs) return null;
  const remaining = startMs - nowMs;
  for (const k of REMINDER_KINDS) {
    const [lo, hi] = REMINDER_WINDOWS[k];
    if (remaining >= lo && remaining <= hi) return sent.has(k) ? null : k;
  }
  return null;
}

// ---------------------------------------------------------------- times

function validTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function fmtIn(ms: number, timeZone: string, withDay: boolean): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    ...(withDay ? { weekday: "long" as const, month: "long" as const, day: "numeric" as const } : {}),
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const time = `${get("hour")}:${get("minute")} ${get("dayPeriod")} ${get("timeZoneName")}`.replace(/\s+/g, " ").trim();
  return withDay ? `${get("weekday")}, ${get("month")} ${get("day")} at ${time}` : time;
}

/**
 * "Thursday, October 8 at 2:00 PM CDT" in the invitee's timezone when we know
 * it, otherwise "Thursday, October 8 at 3:00 PM EDT (7:00 PM UTC)".
 */
export function formatInterviewTime(startMs: number, timeZone?: unknown): string {
  if (validTimeZone(timeZone)) return fmtIn(startMs, timeZone, true);
  return `${fmtIn(startMs, "America/New_York", true)} (${fmtIn(startMs, "UTC", false)})`;
}

// ---------------------------------------------------------------- copy

export const WHAT_TO_BRING =
  "What to bring: your phone, charged, a quiet spot with good light, and be ready to film a short video during the call.";

export type ReminderInput = {
  first: string;
  when: string;
  joinUrl?: string | null;
  rescheduleUrl?: string | null;
};

export function reminderEmail(kind: ReminderKind, i: ReminderInput): { subject: string; text: string } {
  const first = i.first || "there";
  const join = i.joinUrl
    ? `Here's the link to join:\n${i.joinUrl}`
    : "The link to join is in your Calendly confirmation email.";
  const resched = i.rescheduleUrl
    ? kind === "now"
      ? `If you can't make it, you can pick another time here:\n${i.rescheduleUrl}`
      : `If the time doesn't work anymore, you can reschedule here:\n${i.rescheduleUrl}`
    : null;

  let subject: string;
  let opener: string;
  if (kind === "24h") {
    subject = "Your KESHAH group interview is tomorrow";
    opener = `Just a heads up, your KESHAH group interview is tomorrow, ${i.when}.`;
  } else if (kind === "1h") {
    subject = "Your KESHAH group interview starts in an hour";
    opener = `Quick reminder, your KESHAH group interview starts in about an hour, at ${i.when}.`;
  } else {
    subject = "We're waiting for you: KESHAH group interview";
    opener = "This is McKenzie from KESHAH. We're waiting for you to start the group interview.";
  }

  const blocks = [`Hi ${first},`, opener, join, WHAT_TO_BRING, ...(resched ? [resched] : [])];
  const closing = kind === "now" ? "See you in a minute," : "See you there,";
  return { subject, text: `${blocks.join("\n\n")}\n\n${closing}\n${CREATOR_SIGNOFF}` };
}

export function startingNowText(first: string, joinUrl?: string | null): string {
  return (
    `Hi ${first || "there"}, this is McKenzie, creator coordinator at KESHAH. We're waiting for you to start the group interview.` +
    (joinUrl ? ` Here's the link: ${joinUrl}` : " The link to join is in your Calendly email.")
  );
}

// ---------------------------------------------------------------- no-shows

export const SLOT_TOLERANCE_MS = 30 * MIN;
/** No-show email goes out once this long after the session starts. */
export const NOSHOW_DELAY_MS = 30 * MIN;
/** Attendees without a video keep the existing first follow-up at 60 min. */
export const ATTENDEE_FIRST_DELAY_MS = 60 * MIN;

export type AttendanceClass = "no_show" | "attendee";

function bookedStartMs(app: Record<string, unknown>): number {
  const v = app.calendly_event_start_time;
  return typeof v === "string" ? Date.parse(v) || 0 : 0;
}

/** Booked into this session's time slot (±30 min, same as getSessionApplicants). */
export function bookedIntoSlot(app: Record<string, unknown>, sessionStartMs: number): boolean {
  const b = bookedStartMs(app);
  return !!b && !!sessionStartMs && Math.abs(b - sessionStartMs) <= SLOT_TOLERANCE_MS;
}

/** Opened THIS session's interview page. */
export function openedSession(app: Record<string, unknown>, slug: string): boolean {
  return app.interview_session === slug && present(app.interview_opened_at);
}

/**
 * no_show: booked into the session's slot but never opened its page.
 * attendee: everyone else in the session (opened the page, or showed up
 * without a booking).
 */
export function classifyAttendance(
  app: Record<string, unknown>,
  session: { slug: string; starts_at_ms: number },
): AttendanceClass {
  if (openedSession(app, session.slug)) return "attendee";
  return bookedIntoSlot(app, session.starts_at_ms) ? "no_show" : "attendee";
}

/**
 * Should a no-show get the "sorry we missed you" email now? Once, from 30 min
 * after the start until the session closes, and never if they already got a
 * session-link follow-up (e.g. sessions that started before this shipped).
 */
export function noShowEmailDue(
  app: Record<string, unknown>,
  session: { starts_at_ms: number; closes_at_ms: number },
  nowMs: number,
): boolean {
  if (present(app[NOSHOW_EMAIL_FIELD])) return false;
  if (present(app.interview_followup_1_sent_at) || present(app.interview_followup_2_sent_at)) return false;
  if (present(app.interview_video_submitted_at)) return false;
  return nowMs >= session.starts_at_ms + NOSHOW_DELAY_MS && nowMs < session.closes_at_ms;
}

export function videoLinkFor(siteUrl: string, email: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/interview/video?email=${encodeURIComponent(email)}`;
}

/** "6:00 PM ET on Thursday, Oct 8" for a deadline. */
export function formatDeadlineET(ms: number): string {
  const d = new Date(ms);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }).format(d);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "long", month: "short", day: "numeric" }).format(d);
  return `${time} ET on ${day}`;
}

const DENIAL_LINE = "Applications without a test video are automatically denied.";

export function noShowEmail(i: { first: string; link: string; deadline: string; recordingUrl?: string | null }): {
  subject: string;
  text: string;
} {
  const blocks = [
    `Hi ${i.first || "there"},`,
    "If you couldn't make the KESHAH group interview today, or didn't get to film your video, you can still do the video test on your phone.",
    ...(i.recordingUrl ? [`Here's a recording of the presentation:\n${i.recordingUrl}`] : []),
    `Open this link on your phone and film the short video. It takes about 10 minutes:\n${i.link}`,
    `It's due by ${i.deadline}. ${DENIAL_LINE}`,
  ];
  return { subject: "Your KESHAH video test", text: `${blocks.join("\n\n")}\n\n${CREATOR_SIGNOFF}` };
}

export function noShowText(first: string, link: string, deadline: string, alreadyIntroduced = false): string {
  // Worded for both cases our signal can't tell apart: missed the call, or
  // joined but didn't get to film. Skip the intro if we texted them at the start.
  const hi = alreadyIntroduced ? `Hi ${first || "there"},` : `Hi ${first || "there"}, this is McKenzie, creator coordinator at KESHAH.`;
  return `${hi} If you couldn't make the group interview or didn't get to film your video, you can still do it on your phone: ${link} It's due by ${deadline}. ${DENIAL_LINE}`;
}

export function firstNameOf(app: Record<string, unknown>): string {
  return String(app.full_name ?? "").trim().split(/\s+/)[0] || "there";
}
