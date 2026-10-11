// Pure helpers for group-interview reminders and no-show follow-ups.
// No Firestore here, so it's unit tested in interview-reminders.test.ts.
//
// Reminders (app/api/interview/reminders, every minute) go to applicants with
// a Calendly booking in the future:
//   booking  text 3 to 30 min after the booking is recorded (booked_at), only
//            when the interview is 90+ min away ("reply with your full name to
//            confirm your spot"). A name reply confirms them for that booking.
//   24h   when 23h to 25h remain
//   1h    text only, 59 to 61 min before, with the link (+ "reply with your
//         full name to confirm" when they haven't confirmed yet)
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
export const REMINDER_1H_TEXT_FIELD = "interview_reminder_1h_text_sent_at";
export const CHECKED_IN_FIELD = "interview_checked_in_at";
/** The booked start the check-in was for (a reschedule needs a new one). */
export const CHECKED_IN_FOR_FIELD = "interview_checked_in_for";
export const CHECKIN_REPLY_TEXT_FIELD = "interview_checkin_reply";
export const CHECKIN_TEXT_SENT_FIELD = "interview_checkin_text_sent_at";
export const NOSHOW_EMAIL_FIELD = "interview_noshow_email_sent_at";

// Booking confirmation text (sent a few minutes after the booking is recorded).
/** Claim: the booked start the booking text is for (a reschedule gets a fresh one). */
export const BOOKING_TEXT_FOR_FIELD = "interview_booking_text_for";
/** When the claim was taken (the send follows straight after). */
export const BOOKING_TEXT_CLAIMED_FIELD = "interview_booking_text_claimed_at";
/** Set once the text actually went out. */
export const BOOKING_TEXT_SENT_FIELD = "interview_booking_text_sent_at";
/** A name reply to the booking text (or the 1h text) confirms them for that booking. */
export const CONFIRMED_FIELD = "interview_confirmed_at";
export const CONFIRMED_FOR_FIELD = "interview_confirmed_for";
export const CONFIRM_REPLY_TEXT_FIELD = "interview_confirm_reply";
export const CONFIRM_TEXT_SENT_FIELD = "interview_confirm_text_sent_at";
export const NOSHOW_TEXT_FIELD = "interview_noshow_text_sent_at";

/** [minRemaining, maxRemaining] in ms, inclusive. Negative = after start. */
export const REMINDER_WINDOWS: Record<ReminderKind, [number, number]> = {
  "24h": [23 * HOUR, 25 * HOUR],
  // Text only, sent once in the minute or so around 60 min before.
  "1h": [59 * MIN, 61 * MIN],
  // Cron runs every minute: the text goes out in the first minute after the
  // start time (a second minute only as a retry if the first send failed).
  now: [-2 * MIN, 0],
};

/** How far back / ahead the cron needs to look for bookings. */
export const REMINDER_LOOKBACK_MS = 3 * MIN;
export const REMINDER_LOOKAHEAD_MS = 25 * HOUR;

/** The booking text goes out this long after booked_at at the earliest... */
export const BOOKING_TEXT_DELAY_MS = 100 * 1000; // 100 seconds (sent on the next minute check after that)
/**
 * ...and never later than this. Also what keeps bookings recorded before
 * this shipped from all getting one at once: only fresh bookings qualify.
 */
export const BOOKING_TEXT_MAX_AGE_MS = 30 * MIN;
/** Interviews starting sooner than this skip it (the 1h / start texts cover them). */
export const BOOKING_TEXT_MIN_LEAD_MS = 90 * MIN;

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

/**
 * "5:00 PM CT" in the invitee's timezone when we know it, else "6:00 PM ET".
 * Uses the generic zone name (CT, ET, PT); falls back to the short one
 * (GMT+1) where there's no short generic name.
 */
export function formatShortTime(startMs: number, timeZone?: unknown): string {
  const tz = validTimeZone(timeZone) ? timeZone : "America/New_York";
  const d = new Date(startMs);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d);
  const zoneName = (style: "shortGeneric" | "short") =>
    new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: style }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? "";
  let zone = zoneName("shortGeneric");
  if (!zone || /\s/.test(zone) || zone.length > 5) zone = zoneName("short");
  return `${time} ${zone}`.replace(/\s+/g, " ").trim();
}

/**
 * "Thursday at 6:00 PM CT" in the invitee's timezone (else ET). Six or more
 * days out the weekday alone is ambiguous, so the date is added:
 * "Thursday, October 15 at 6:00 PM CT".
 */
export function formatDayAndTime(startMs: number, timeZone?: unknown, nowMs: number = Date.now()): string {
  const tz = validTimeZone(timeZone) ? timeZone : "America/New_York";
  const opts: Intl.DateTimeFormatOptions =
    startMs - nowMs >= 6 * 24 * HOUR ? { timeZone: tz, weekday: "long", month: "long", day: "numeric" } : { timeZone: tz, weekday: "long" };
  const day = new Intl.DateTimeFormat("en-US", opts).format(new Date(startMs));
  return `${day} at ${formatShortTime(startMs, timeZone)}`;
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

/**
 * Start-time text. If the 1h text already went out, McKenzie has introduced
 * herself, so the intro is dropped.
 */
export function startingNowText(first: string, joinUrl?: string | null, alreadyIntroduced = false): string {
  const name = first || "there";
  const hi = alreadyIntroduced ? `Hi ${name},` : `Hi ${name}, this is McKenzie, creator coordinator at KESHAH.`;
  return [
    hi,
    "We're waiting for you to start the group interview.",
    joinUrl ? `Here's the link:\n${joinUrl}` : "The link to join is in your Calendly email.",
  ].join("\n\n");
}

const MCKENZIE_INTRO = "this is McKenzie, creator coordinator at KESHAH.";

/** Booking confirmation, a few minutes after they book. */
export function bookingText(first: string, when: string): string {
  return `Hi ${first || "there"}, ${MCKENZIE_INTRO} Thanks for applying, you're booked for the group interview on ${when}. Reply with your full name to confirm your spot.`;
}

/** Reply to a name reply to the booking text. */
export function confirmReplyText(first: string, when: string, joinUrl?: string | null): string {
  const name = first || "there";
  return joinUrl
    ? `Thanks ${name}, you're confirmed. Here's the link for ${when}: ${joinUrl}`
    : `Thanks ${name}, you're confirmed for ${when}. The link is in your Calendly email.`;
}

/**
 * 1 hour before. McKenzie introduces herself only if this is the first text
 * for the booking; people who haven't confirmed are asked to.
 */
export function oneHourText(
  first: string,
  time: string,
  joinUrl?: string | null,
  o: { confirmed?: boolean; introduced?: boolean } = {},
): string {
  const name = first || "there";
  const hi = o.introduced ? `Hi ${name}, ` : `Hi ${name}, ${MCKENZIE_INTRO} `;
  const link = joinUrl ? `Here's the link: ${joinUrl}` : "The link is in your Calendly email.";
  const ask = o.confirmed ? "" : "\n\nReply with your full name to confirm you're coming.";
  // "Hi Sam, your group..." after a plain greeting; "...at KESHAH. Your group..." after the intro.
  const body = `${o.introduced ? "your" : "Your"} group interview starts in 1 hour, at ${time}.`;
  return `${hi}${body} ${link}${ask}`;
}

export function checkInReplyText(first: string, time: string, joinUrl?: string | null): string {
  return joinUrl
    ? `Thanks ${first || "there"}, you're checked in.\n\nHere's the link for ${time}:\n${joinUrl}`
    : `Thanks ${first || "there"}, you're checked in.\n\nThe link for ${time} is in your Calendly email.`;
}

/** Did the 1h text go out for THIS booking (not one before a reschedule)? */
export function got1hText(app: Record<string, unknown>, startIso: string): boolean {
  return present(app[REMINDER_1H_TEXT_FIELD]) && app[REMINDER_START_FIELD] === startIso;
}

function msOf(v: unknown): number {
  if (v && typeof v === "object" && "toMillis" in (v as object)) return (v as { toMillis: () => number }).toMillis();
  if (typeof v === "string") return Date.parse(v) || 0;
  if (typeof v === "number") return v;
  return 0;
}

function bookedStartIso(app: Record<string, unknown>): string {
  return typeof app.calendly_event_start_time === "string" ? app.calendly_event_start_time : "";
}

/** Did the booking text go out for THIS booking (not one before a reschedule)? */
export function gotBookingText(app: Record<string, unknown>, startIso: string): boolean {
  return !!startIso && present(app[BOOKING_TEXT_SENT_FIELD]) && app[BOOKING_TEXT_FOR_FIELD] === startIso;
}

/** Confirmed (a name reply) for THIS booking. */
export function confirmedForBooking(app: Record<string, unknown>, startIso: string): boolean {
  return !!startIso && present(app[CONFIRMED_FIELD]) && app[CONFIRMED_FOR_FIELD] === startIso;
}

/** Checked in for THIS booking. */
export function checkedInFor(app: Record<string, unknown>, startIso: string): boolean {
  return !!startIso && present(app[CHECKED_IN_FIELD]) && app[CHECKED_IN_FOR_FIELD] === startIso;
}

/**
 * Should the booking text go out now? Once per booked start, 3 to 30 min
 * after the booking was recorded, and only when the interview is still 90+
 * min away. Bookings recorded more than 30 min ago (e.g. before this
 * shipped) never get one.
 */
export function bookingTextDue(app: Record<string, unknown>, nowMs: number): boolean {
  if (!isReminderEligible(app)) return false;
  const startIso = bookedStartIso(app);
  const startMs = startIso ? Date.parse(startIso) || 0 : 0;
  if (!startMs) return false;
  if (app[BOOKING_TEXT_FOR_FIELD] === startIso) return false; // claimed or sent for this booking
  const bookedMs = msOf(app.booked_at);
  if (!bookedMs) return false;
  const age = nowMs - bookedMs;
  if (age < BOOKING_TEXT_DELAY_MS || age > BOOKING_TEXT_MAX_AGE_MS) return false;
  return startMs - nowMs >= BOOKING_TEXT_MIN_LEAD_MS;
}

/**
 * Should a reply received at replyMs confirm this applicant? Only after the
 * booking text for their current booking went out, before the interview
 * starts, and when they aren't confirmed or checked in for it yet. (After the
 * 1h text, checkInDue takes over.)
 */
export function confirmDue(app: Record<string, unknown>, replyMs: number, nowMs: number): boolean {
  if (!isReminderEligible(app)) return false;
  const startIso = bookedStartIso(app);
  const startMs = startIso ? Date.parse(startIso) || 0 : 0;
  if (!startMs) return false;
  if (!gotBookingText(app, startIso)) return false;
  if (confirmedForBooking(app, startIso) || checkedInFor(app, startIso)) return false;
  // A reply sent before the booking text isn't an answer to it.
  const claimedMs = msOf(app[BOOKING_TEXT_CLAIMED_FIELD]);
  if (claimedMs && replyMs < claimedMs) return false;
  return replyMs < startMs && nowMs < startMs;
}

const CHECKIN_AFFIRMATIONS = new Set([
  "yes", "yeah", "yea", "yep", "yup", "y", "ya", "ok", "okay", "k", "sure", "ready", "present",
  "here", "im here", "i am here", "here now", "confirmed", "confirm", "i confirm",
  "check in", "checked in", "checking in", "check me in", "im in",
  "will be there", "ill be there", "i will be there", "see you there", "see you soon",
  "yes im here", "yes ill be there", "yes i will be there", "yes confirmed",
]);
const CHECKIN_BLOCKERS = /\b(late|reschedul\w*|cancel\w*|cant|cannot|can't|wont|won't|not|no|nope|miss\w*|sorry|who|what|when|where|why|how|link|help|stop)\b/i;

/**
 * Does a reply to the 1h text look like a check-in? 1 to 4 words, mostly
 * letters, no question, and either overlaps the applicant's name or is a
 * short yes/here. Anything else ("can I reschedule?", "running late") is left
 * for a person to answer.
 */
export function looksLikeCheckIn(text: string, fullName?: unknown): boolean {
  const raw = (text ?? "").trim();
  if (!raw || raw.includes("?")) return false;
  const cleaned = raw
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .replace(/[.!,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = cleaned.split(" ").filter(Boolean);
  if (words.length < 1 || words.length > 4) return false;
  const chars = cleaned.replace(/\s/g, "");
  const letters = (chars.match(/\p{L}/gu) ?? []).length;
  if (!chars.length || letters / chars.length < 0.8) return false;
  if (CHECKIN_BLOCKERS.test(cleaned)) return false;
  if (CHECKIN_AFFIRMATIONS.has(cleaned)) return true;
  const nameWords = String(fullName ?? "")
    .toLowerCase()
    .replace(/[\u2019']/g, "")
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 2);
  if (!nameWords.length) return false;
  const filler = new Set(["its", "im", "i", "am", "this", "is", "here", "yes", "hi", "hey", "hello", "checking", "in", "name", "my"]);
  const rest = words.filter((w) => !filler.has(w));
  // Every non-filler word is part of the name, and at least one is there.
  return rest.length > 0 && rest.every((w) => nameWords.includes(w));
}

/** How long before the start a reply still counts as a check-in. */
export const CHECKIN_WINDOW_MS = 70 * MIN;

/**
 * Should a reply received at replyMs check this applicant in? Only when they
 * got the 1h text for their current booking, the interview is coming up
 * (starts within the next 70 min of the reply, and hasn't started yet when
 * we process it), and they aren't checked in for this booking yet.
 */
export function checkInDue(app: Record<string, unknown>, replyMs: number, nowMs: number): boolean {
  if (!isReminderEligible(app)) return false;
  const startIso = typeof app.calendly_event_start_time === "string" ? app.calendly_event_start_time : "";
  const startMs = startIso ? Date.parse(startIso) || 0 : 0;
  if (!startMs) return false;
  if (!got1hText(app, startIso)) return false;
  if (present(app[CHECKED_IN_FIELD]) && app[CHECKED_IN_FOR_FIELD] === startIso) return false;
  const lead = startMs - replyMs;
  if (lead <= 0 || lead > CHECKIN_WINDOW_MS) return false;
  return nowMs < startMs;
}

// ---------------------------------------------------------------- no-shows

export const SLOT_TOLERANCE_MS = 30 * MIN;
/** No-show messages go out once this long after the session starts, i.e. after the call has ended. */
export const NOSHOW_DELAY_MS = 90 * MIN; // after the interview has ended (calls run up to ~an hour)
/** First follow-up for attendees without a video, also once the call has ended. */
export const ATTENDEE_FIRST_DELAY_MS = 90 * MIN;

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
  void email; // the page asks for their email; a bare link reads cleaner in a text
  return `${siteUrl.replace(/\/+$/, "")}/interview/video`;
}

/**
 * Deadline in Eastern, plus the applicant's own time when we know their
 * timezone and it isn't Eastern: "11:59 PM ET (8:59 PM your time) on
 * Wednesday, Oct 7". If their local day differs it says so.
 */
export function formatDeadline(ms: number, timeZone?: unknown, nowMs: number = Date.now()): string {
  // Relative to when the message goes out, on the Eastern calendar:
  // "tonight at 11:59 PM ET", "tomorrow at 11:59 PM ET", else "on Wednesday, Oct 7 at 11:59 PM ET".
  const d = new Date(ms);
  const part = (tz: string, o: Intl.DateTimeFormatOptions, at: Date = d) => new Intl.DateTimeFormat("en-US", { timeZone: tz, ...o }).format(at);
  const etDate = (at: Date) => part("America/New_York", { year: "numeric", month: "2-digit", day: "2-digit" }, at);
  const etTime = part("America/New_York", { hour: "numeric", minute: "2-digit" });
  const today = etDate(new Date(nowMs));
  const tomorrow = etDate(new Date(nowMs + 24 * 3600 * 1000));
  const target = etDate(d);
  let when: string;
  if (target === today) when = `tonight at ${etTime} ET`;
  else if (target === tomorrow) when = `tomorrow at ${etTime} ET`;
  else when = `on ${part("America/New_York", { weekday: "long", month: "short", day: "numeric" })} at ${etTime} ET`;
  if (!validTimeZone(timeZone)) return when;
  const localTime = part(timeZone, { hour: "numeric", minute: "2-digit" });
  const sameDay = part(timeZone, { weekday: "long" }) === part("America/New_York", { weekday: "long" });
  if (localTime === etTime && sameDay) return when;
  return `${when} (${localTime}${sameDay ? "" : " " + part(timeZone, { weekday: "long" })} your time)`;
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
    `It's due ${i.deadline}. ${DENIAL_LINE}`,
  ];
  return { subject: "Your KESHAH video test", text: `${blocks.join("\n\n")}\n\n${CREATOR_SIGNOFF}` };
}

export function noShowText(first: string, link: string, deadline: string, alreadyIntroduced = false): string {
  // Worded for both cases our signal can't tell apart: missed the call, or
  // joined but didn't get to film. Skip the intro if we texted them at the start.
  const name = first || "there";
  const hi = alreadyIntroduced ? `Hi ${name},` : `Hi ${name}, this is McKenzie, creator coordinator at KESHAH.`;
  return [
    hi,
    `If you couldn't make the group interview or didn't get to film your video, you can still do it on your phone:\n${link}`,
    `It's due ${deadline}. Applications without a test video are automatically denied.`,
  ].join("\n\n");
}

export function firstNameOf(app: Record<string, unknown>): string {
  return String(app.full_name ?? "").trim().split(/\s+/)[0] || "there";
}
