/**
 * Applicant view for the KESHAH Creators app: status, interview card, check-in
 * window and video deadline, worked out from a careers_applications doc.
 * Pure (no Firestore); unit tested in lib/creators/mobile.test.ts.
 */
import { endOfNextEasternDayMs, VIDEO_SLUG } from "@/lib/interview";
import { CHECKED_IN_FIELD, CHECKED_IN_FOR_FIELD } from "@/lib/interview-reminders";

export type ApplicantStatus = "applied" | "interview_booked" | "in_review" | "accepted" | "not_moving_forward";

export interface ApplicantInterview {
  starts_at: string;
  join_url: string | null;
  reschedule_url: string | null;
  checked_in: boolean;
  video_test_open: boolean;
  video_deadline: string | null;
}

const MIN = 60 * 1000;
/** Check-in opens this long before the start (same window as the SMS check-in)... */
export const CHECKIN_OPENS_BEFORE_MS = 70 * MIN;
/** ...and stays open until this long after it. */
export const CHECKIN_CLOSES_AFTER_MS = 30 * MIN;
/** The video test opens on the call itself (people film during it). */
export const VIDEO_OPENS_BEFORE_MS = 15 * MIN;

/** Fallback when CALENDLY_BOOKING_URL isn't set: the link the careers apply page embeds. */
export const DEFAULT_BOOKING_URL = "https://calendly.com/aadi-keshah/group-interview";

export function bookingUrl(): string {
  return (process.env.CALENDLY_BOOKING_URL ?? "").trim() || DEFAULT_BOOKING_URL;
}

function present(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false && v !== "";
}

function toMs(v: unknown): number {
  if (!v) return 0;
  if (typeof v === "number") return v;
  if (typeof v === "string") return Date.parse(v) || 0;
  if (v instanceof Date) return v.getTime();
  const t = v as { toMillis?: () => number };
  return typeof t.toMillis === "function" ? t.toMillis() : 0;
}

export function bookedStartMs(app: Record<string, unknown>): number {
  return typeof app.calendly_event_start_time === "string" ? Date.parse(app.calendly_event_start_time) || 0 : 0;
}

const DENIED = new Set(["denied", "rejected", "withdrawn"]);

export function isClosedOut(app: Record<string, unknown>): boolean {
  const s = String(app.status ?? "");
  return s === "accepted" || DENIED.has(s);
}

export function videoSubmitted(app: Record<string, unknown>): boolean {
  return present(app.interview_video_submitted_at);
}

/**
 * When their test video is due, or null when it never closes:
 *   1. interview_video_deadline on the doc (set by hand) wins;
 *   2. tagged to a real group-interview session: that session's close time
 *      (the route passes it in, it lives on the session doc);
 *   3. booked a call: 11:59 PM ET the day after it (the session rule);
 *   4. otherwise (always-open /interview/video link): no deadline.
 */
export function videoDeadlineMs(app: Record<string, unknown>, sessionClosesAtMs: number | null): number | null {
  const explicit = toMs(app.interview_video_deadline);
  if (explicit) return explicit;
  const slug = typeof app.interview_session === "string" ? app.interview_session : "";
  if (slug && slug !== VIDEO_SLUG && sessionClosesAtMs) return sessionClosesAtMs;
  const start = bookedStartMs(app);
  if (start) return endOfNextEasternDayMs(start);
  return null;
}

/** null when they can send the video now, otherwise why not. */
export function videoProblem(
  app: Record<string, unknown>,
  ctx: { nowMs: number; sessionClosesAtMs: number | null; sessionOpen: boolean | null },
): string | null {
  if (isClosedOut(app)) return "Your application is already decided, so there's no video to send.";
  if (videoSubmitted(app)) return "We already have your video.";
  const slug = typeof app.interview_session === "string" ? app.interview_session : "";
  if (slug && slug !== VIDEO_SLUG) {
    if (present(app.interview_link_closed_at) || ctx.sessionOpen === false) return "The deadline for your video has passed.";
  }
  const deadline = videoDeadlineMs(app, ctx.sessionClosesAtMs);
  if (deadline && ctx.nowMs >= deadline) return "The deadline for your video has passed.";
  return null;
}

export function applicantStatus(
  app: Record<string, unknown>,
  ctx: { nowMs: number; sessionClosesAtMs: number | null },
): ApplicantStatus {
  const s = String(app.status ?? "");
  if (DENIED.has(s)) return "not_moving_forward";
  if (s === "accepted") return "accepted";
  if (videoSubmitted(app) || present(app.interview_passed_at)) return "in_review";
  const start = bookedStartMs(app);
  if (start) {
    // Booked counts while the call is ahead, and afterwards for as long as
    // they can still send their video (so the app keeps showing that step).
    const deadline = videoDeadlineMs(app, ctx.sessionClosesAtMs);
    if (ctx.nowMs < start || (deadline !== null && ctx.nowMs < deadline)) return "interview_booked";
  }
  return "applied";
}

export function checkedInForBooking(app: Record<string, unknown>): boolean {
  const start = typeof app.calendly_event_start_time === "string" ? app.calendly_event_start_time : "";
  return !!start && present(app[CHECKED_IN_FIELD]) && app[CHECKED_IN_FOR_FIELD] === start;
}

export type CheckInWindow = "open" | "too_early" | "too_late" | "no_booking";

export function checkInWindow(app: Record<string, unknown>, nowMs: number): CheckInWindow {
  const start = bookedStartMs(app);
  if (!start || isClosedOut(app)) return "no_booking";
  if (nowMs < start - CHECKIN_OPENS_BEFORE_MS) return "too_early";
  if (nowMs > start + CHECKIN_CLOSES_AFTER_MS) return "too_late";
  return "open";
}

export function interviewCard(
  app: Record<string, unknown>,
  ctx: { nowMs: number; sessionClosesAtMs: number | null; sessionOpen: boolean | null },
): ApplicantInterview | null {
  const start = bookedStartMs(app);
  if (!start || isClosedOut(app)) return null;
  const deadline = videoDeadlineMs(app, ctx.sessionClosesAtMs);
  return {
    starts_at: new Date(start).toISOString(),
    join_url: (app.calendly_join_url as string) || null,
    reschedule_url: (app.calendly_reschedule_url as string) || null,
    checked_in: checkedInForBooking(app),
    video_test_open: ctx.nowMs >= start - VIDEO_OPENS_BEFORE_MS && videoProblem(app, ctx) === null,
    video_deadline: deadline ? new Date(deadline).toISOString() : null,
  };
}
