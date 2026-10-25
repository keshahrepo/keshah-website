// Pure rules for recruiting decisions: the denial email, the silent no-video
// auto-deny, and Calendly cancellations. No Firestore here, so it's unit
// tested in interview-decisions.test.ts.

import { CREATOR_FROM_NAME, CREATOR_SIGNOFF } from "./creators/invite";

export { CREATOR_FROM_NAME };

const MIN = 60 * 1000;

/** Statuses a person decided (or the applicant pulled out of). Never changed by automation. */
export const DECIDED_STATUSES = new Set(["accepted", "denied", "rejected", "withdrawn"]);

export function isDecided(status: unknown): boolean {
  return DECIDED_STATUSES.has(String(status ?? ""));
}

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false && v !== "";
}

/** They sent their interview video test. */
export function hasInterviewVideo(app: Record<string, unknown>): boolean {
  if (present(app.interview_video_submitted_at)) return true;
  return typeof app.video_object_path === "string" && app.video_object_path.trim() !== "";
}

// ---------------------------------------------------------------- denial email

/** Claimed before the denial email goes out, so it's sent at most once. */
export const DENIAL_EMAIL_FIELD = "denial_email_sent_at";

/**
 * Does denying this applicant send the "not moving forward" email? Only to
 * people who interviewed and sent their video test, once. No-shows (no video)
 * get nothing.
 */
export function denialEmailDue(app: Record<string, unknown>): boolean {
  if (present(app[DENIAL_EMAIL_FIELD])) return false;
  if (!String(app.email ?? "").trim()) return false;
  return hasInterviewVideo(app);
}

export function denialEmail(first: string): { subject: string; text: string } {
  return {
    subject: "Your KESHAH application",
    text: [
      `Hi ${first || "there"},`,
      "Thank you for taking the time to interview with us and film your video test. We really appreciated it.",
      "After reviewing everything, we've decided not to move forward with your application this time.",
      "We wish you all the best.",
      `Best,\n${CREATOR_SIGNOFF}`,
    ].join("\n\n"),
  };
}

/** Sent when an application closes without a test video (no-show or never filmed). */
export function autoDenyEmail(first: string): { subject: string; text: string } {
  return {
    subject: "Your KESHAH application",
    text: [
      `Hi ${first || "there"},`,
      "Thanks for applying to KESHAH. We didn't get a test video from you before the deadline, so we've closed your application for now.",
      "If you'd still like to be considered, you're welcome to apply again.",
      `Best,\n${CREATOR_SIGNOFF}`,
    ].join("\n\n"),
  };
}

export const OUTSIDE_US_REASON = "outside_us";

/** Sent when a booking comes from outside the US: the booking is cancelled and the application closed. */
export function outsideUsEmail(first: string): { subject: string; text: string } {
  return {
    subject: "Your KESHAH application",
    text: [
      `Hi ${first || "there"},`,
      "Thanks for applying to KESHAH. Right now this role is only open to people living in the US, so we've cancelled your interview booking.",
      "We really appreciate your interest, and we'll let you know if that changes.",
      `Best,\n${CREATOR_SIGNOFF}`,
    ].join("\n\n"),
  };
}

/**
 * The hiring is US only. True for a Calendly invitee time zone that is clearly outside the US
 * (e.g. Africa/Nairobi), false for US zones and anything ambiguous (empty, Etc/GMT offsets).
 */
export function outsideUsTimezone(tz: string | null | undefined): boolean {
  const z = String(tz ?? "").trim();
  if (!z || z.startsWith("Etc/") || z.startsWith("US/") || z === "UTC") return false;
  if (z === "Pacific/Honolulu" || z === "America/Puerto_Rico") return false;
  if (/^America\/(New_York|Chicago|Denver|Los_Angeles|Phoenix|Anchorage|Detroit|Boise|Juneau|Sitka|Nome|Adak|Metlakatla|Yakutat|Menominee|Indiana\/|Kentucky\/|North_Dakota\/)/.test(z)) return false;
  return true;
}

// ---------------------------------------------------------------- no-video auto-deny

export const AUTO_DENY_REASON = "no_video";
/** Booked starts this far from the session still count as that session's slot. */
const SLOT_TOLERANCE_MS = 30 * MIN;

/** Only applicants still in the interview stage are auto-denied. */
const AUTO_DENY_STATUSES = new Set(["booked", "completed"]);

/**
 * Silent auto-deny: the session's video deadline has passed and they never
 * sent a video. Never touches decided applications, people who canceled
 * their booking (back to awaiting_booking), or anyone booked into a later
 * call (they rescheduled). Applications flagged as a possible duplicate of a
 * mistyped email are left for the founder.
 */
export function autoDenyDue(
  app: Record<string, unknown>,
  session: { starts_at_ms: number; closes_at_ms: number },
  nowMs: number,
): boolean {
  if (!session.starts_at_ms || nowMs < session.closes_at_ms) return false;
  if (!AUTO_DENY_STATUSES.has(String(app.status ?? ""))) return false;
  if (hasInterviewVideo(app)) return false;
  if (present(app.interview_possible_duplicate_id)) return false;
  const start = typeof app.calendly_event_start_time === "string" ? Date.parse(app.calendly_event_start_time) || 0 : 0;
  if (start && start > session.starts_at_ms + SLOT_TOLERANCE_MS) return false;
  return true;
}

// ---------------------------------------------------------------- Calendly cancels

/** Booking fields the Calendly webhook writes; a cancel removes them. */
export const BOOKING_FIELDS = [
  "calendly_event_start_time",
  "calendly_event_uri",
  "calendly_join_url",
  "calendly_reschedule_url",
  "calendly_cancel_url",
] as const;

export type CancelDecision =
  /** invitee.canceled as part of a reschedule: invitee.created follows. Ignore. */
  | "reschedule"
  /** The application has no booking to cancel. */
  | "no_booking"
  /** The cancel is for an older booking than the one on the doc. Ignore. */
  | "other_booking"
  /** Clear the booking. */
  | "clear";

/**
 * What to do with an invitee.canceled event. Only clears the booking it is
 * for: matched on the event URI, or on the start time for docs written
 * before we stored the URI.
 */
export function cancelDecision(
  app: Record<string, unknown>,
  ev: { rescheduled?: unknown; event_uri?: string | null; start_time?: string | null },
): CancelDecision {
  if (ev.rescheduled === true) return "reschedule";
  const curStart = typeof app.calendly_event_start_time === "string" ? app.calendly_event_start_time : "";
  if (!curStart) return "no_booking";
  const curUri = typeof app.calendly_event_uri === "string" ? app.calendly_event_uri : "";
  if (curUri && ev.event_uri) return curUri === ev.event_uri ? "clear" : "other_booking";
  const a = Date.parse(curStart);
  const b = Date.parse(ev.start_time ?? "");
  if (a && b) return a === b ? "clear" : "other_booking";
  // Nothing to compare: the cancel is for their only known booking.
  return "clear";
}

/** Status after a cancel: back to booking, unless decided or they already sent a video. */
export function statusAfterCancel(app: Record<string, unknown>): string | null {
  if (isDecided(app.status)) return null;
  if (hasInterviewVideo(app)) return null;
  return "awaiting_booking";
}

// ---------------------------------------------------------------- mistyped emails on /interview

function nameKey(v: unknown): string {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return prev[b.length];
}

/**
 * Someone typed an email we don't know on the interview page: is this booked
 * applicant probably them? Same name (first and last), or an email one or two
 * typos away. Used to keep the no-show texts / auto-deny off the real
 * application, never to merge anything.
 */
export function looksLikeSamePerson(
  typed: { full_name?: unknown; email?: unknown },
  booked: Record<string, unknown>,
): boolean {
  const a = nameKey(typed.full_name);
  const b = nameKey(booked.full_name);
  if (a && b && a.includes(" ") && a === b) return true;
  const e1 = String(typed.email ?? "").trim().toLowerCase();
  const e2 = String(booked.email ?? "").trim().toLowerCase();
  return !!e1 && !!e2 && e1 !== e2 && editDistance(e1, e2) <= 2;
}
