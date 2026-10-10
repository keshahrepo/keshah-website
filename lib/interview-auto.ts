// Pure helpers for automatic group-interview sessions. Every distinct
// Calendly group-interview start time gets an `interview_sessions` doc on its
// own (from the Calendly webhook, with the reminders cron as a safety net), so
// nobody has to create one on the dashboard.
//
// No Firestore here, so it's unit tested in interview-auto.test.ts. The
// Firestore side is ensureSessionForStart / ensureSessionsForBookings in
// lib/interview.ts.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/** A booking belongs to a session whose start is within this much of it (same as getSessionApplicants). */
export const AUTO_SLOT_TOLERANCE_MS = 30 * MIN;

/** The cron makes sure sessions exist for bookings in this window. */
export const AUTO_LOOKBACK_MS = 2 * HOUR;
export const AUTO_LOOKAHEAD_MS = 60 * 24 * HOUR; // every booked slot in the next 60 days gets its session (so Coming up shows it)

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function etParts(ms: number) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    weekday: get("weekday"),
    hour: Number(get("hour")),
    minute: get("minute"),
    period: get("dayPeriod").toLowerCase(), // "am" / "pm"
  };
}

/**
 * Deterministic slug from the start time, in Eastern: "oct-16-6pm",
 * "oct-16-630pm". The same start always gives the same slug, so the webhook
 * and the cron can both create-if-missing without racing into duplicates.
 */
export function autoSessionSlug(startMs: number): string {
  const p = etParts(startMs);
  const mm = p.minute === "00" ? "" : p.minute;
  return `${MONTHS[p.month - 1]}-${p.day}-${p.hour}${mm}${p.period}`;
}

/** Same slug with the year, used if the plain one is taken by another year's session. */
export function autoSessionSlugWithYear(startMs: number): string {
  return `${autoSessionSlug(startMs)}-${etParts(startMs).year}`;
}

/** "Group interview · Thu Oct 16, 6:00 PM ET" */
export function autoSessionTitle(startMs: number): string {
  const p = etParts(startMs);
  const mon = MONTHS[p.month - 1];
  return `Group interview · ${p.weekday} ${mon[0].toUpperCase()}${mon.slice(1)} ${p.day}, ${p.hour}:${p.minute} ${p.period.toUpperCase()} ET`;
}

/** Within the ±30 min slot of a session start. */
export function sameSlot(a: number, b: number): boolean {
  return !!a && !!b && Math.abs(a - b) <= AUTO_SLOT_TOLERANCE_MS;
}

/**
 * Booking start times (ISO strings from calendly_event_start_time) that have
 * no session yet. Distinct, sorted, and one per slot: two bookings at the
 * same time need one session, and a session within ±30 min already covers a
 * booking.
 */
export function missingSessionStarts(bookingStarts: Array<string | null | undefined>, sessionStartsMs: number[]): number[] {
  const covered = sessionStartsMs.filter((x) => x > 0);
  const out: number[] = [];
  const starts = Array.from(
    new Set(bookingStarts.map((v) => (typeof v === "string" ? Date.parse(v) || 0 : 0)).filter((x) => x > 0)),
  ).sort((a, b) => a - b);
  for (const ms of starts) {
    if (covered.some((c) => sameSlot(c, ms))) continue;
    out.push(ms);
    covered.push(ms);
  }
  return out;
}

/** Should the reminders cron run the session safety net on this tick? Every 5 minutes. */
export function autoEnsureDue(nowMs: number): boolean {
  return new Date(nowMs).getUTCMinutes() % 5 === 0;
}
