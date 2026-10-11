/**
 * When the evening pushes go out (app/api/cron/creator-nudge, every 15 min).
 * Pure; tests in nudges.test.ts.
 *
 *   posting    8 PM local on a day they're scheduled to post (their first
 *              posting day included, before start_date is set), when today's
 *              count is short. The cron syncs their posts first unless the
 *              last sync is under 30 minutes old, so the count is current.
 *   first day  8 PM local the evening before their first posting day.
 *   warm-up    6 PM local on a warm-up day they haven't ticked yet.
 *
 * Each is once per creator per local day (markers on ContentCreators/{id}/mobile/push).
 */
import { NUDGE_HOUR } from "@/lib/mobile/nudge";
import { WARMUP_DAYS } from "./onboarding-content";
import { isWeekday } from "./pay";
import { addDays } from "./lifecycle";
import { localDateIn } from "./time";

export const WARMUP_NUDGE_HOUR = 18;
export const FIRST_DAY_EVE_HOUR = NUDGE_HOUR;
/** A sync newer than this is fresh enough to count from. */
export const SYNC_FRESH_MS = 30 * 60 * 1000;

export function localHour(now: Date, timezone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

function localNow(now: Date, timezone: string): { today: string; hour: number } | null {
  try {
    return { today: localDateIn(now, timezone), hour: localHour(now, timezone) };
  } catch {
    return null;
  }
}

export interface NudgeSubject {
  is_active: boolean;
  status: string;
  timezone: string;
  start_date?: string;
  ended_on?: string;
}

/**
 * The local date to send the posting nudge for, or null. `firstDay` is their
 * first posting day while start_date isn't set yet (a trial creator who has
 * finished Getting started). `scheduled` says whether today is a day they're
 * expected to post (pay.ts isScheduledDay, once started).
 */
export function postingNudgeDate(
  c: NudgeSubject,
  now: Date,
  ctx: { firstDay: string | null; lastNudgeDate: string | null | undefined; scheduled: (date: string) => boolean },
): string | null {
  if (!c.is_active) return null;
  if (c.status !== "trial" && c.status !== "active" && c.status !== "leaving") return null;
  const t = localNow(now, c.timezone);
  if (!t || t.hour !== NUDGE_HOUR || !isWeekday(t.today)) return null;
  if (ctx.lastNudgeDate === t.today) return null;
  if (c.ended_on && t.today > c.ended_on) return null;
  if (c.start_date) {
    if (t.today < c.start_date) return null;
    return ctx.scheduled(t.today) ? t.today : null;
  }
  // Not started yet: only from their first posting day.
  return ctx.firstDay && t.today >= ctx.firstDay ? t.today : null;
}

/** The local date to send "Tomorrow is your first posting day" on, or null. */
export function firstDayEveDate(c: NudgeSubject, now: Date, firstDay: string | null, lastSent: string | null | undefined): string | null {
  if (!c.is_active || c.start_date || !firstDay || c.status === "ended") return null;
  const t = localNow(now, c.timezone);
  if (!t || t.hour !== FIRST_DAY_EVE_HOUR) return null;
  if (addDays(t.today, 1) !== firstDay || lastSent === t.today) return null;
  return t.today;
}

/** The local date to send the warm-up reminder on, or null. */
export function warmupNudgeDate(
  c: NudgeSubject,
  now: Date,
  onb: { accounts_done_at?: string | null; warmup_days?: string[]; completed_at?: string | null },
  lastSent: string | null | undefined,
): string | null {
  if (!c.is_active || c.status !== "onboarding" || onb.completed_at || !onb.accounts_done_at) return null;
  const days = onb.warmup_days ?? [];
  if (days.length >= WARMUP_DAYS) return null;
  const t = localNow(now, c.timezone);
  if (!t || t.hour !== WARMUP_NUDGE_HOUR) return null;
  if (days.includes(t.today) || lastSent === t.today) return null;
  return t.today;
}

/** Is the last successful post sync recent enough to count from? */
export function syncIsFresh(lastOkAt: string | null | undefined, now: Date): boolean {
  const t = lastOkAt ? Date.parse(lastOkAt) : NaN;
  return Number.isFinite(t) && now.getTime() - t < SYNC_FRESH_MS;
}
