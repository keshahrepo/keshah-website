/**
 * Evening nudge for creators (app/api/cron/creator-nudge): at 8 PM in the
 * creator's timezone on a weekday, if fewer than 5 videos count for today,
 * push "{n} of 5 videos so far today. Deadline 11:59 PM." Once per creator
 * per local day (marker ContentCreators/{id}/mobile/push.nudge_date).
 * Pure; unit tested in lib/creators/mobile.test.ts.
 */
import { isWeekday, VIDEOS_PER_WEEKDAY } from "@/lib/creators/pay";
import { localDateIn } from "@/lib/creators/time";

export const NUDGE_HOUR = 20;

function localHour(now: Date, timezone: string): number {
  const h = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(h) % 24;
}

export interface NudgeCreator {
  is_active: boolean;
  status: string;
  timezone: string;
  start_date?: string;
  ended_on?: string;
}

/**
 * The creator-local date to nudge for right now, or null. Only creators who
 * are posting (trial, active or leaving, started, not past ended_on), on a weekday, during the
 * 8 PM hour, and not already nudged today.
 */
export function nudgeDateDue(c: NudgeCreator, now: Date, lastNudgeDate: string | null | undefined): string | null {
  if (!c.is_active) return null;
  if (c.status !== "trial" && c.status !== "active" && c.status !== "leaving") return null;
  let today: string;
  try {
    today = localDateIn(now, c.timezone);
    if (localHour(now, c.timezone) !== NUDGE_HOUR) return null;
  } catch {
    return null;
  }
  if (!isWeekday(today)) return null;
  if (!c.start_date || today < c.start_date) return null;
  if (c.ended_on && today > c.ended_on) return null;
  if (lastNudgeDate === today) return null;
  return today;
}

/** Should the nudge go out, given today's counted videos and whether today is an approved day off? */
export function nudgeNeeded(doneToday: number, dayOff: boolean): boolean {
  return !dayOff && doneToday < VIDEOS_PER_WEEKDAY;
}
