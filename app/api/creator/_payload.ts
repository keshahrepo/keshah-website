import {
  creatorToday,
  hasStarted,
  getMonthOverview,
  monthDayStates,
  type CreatorHistory,
} from "@/lib/creators/db";
import type { CreatorProfile, YyyyMm } from "@/lib/creators/types";

/** What the creator sees about a month's pay. */
export async function monthPayload(creator: CreatorProfile, month: YyyyMm, history: CreatorHistory, now = new Date()) {
  const o = await getMonthOverview(creator, month, { now, history });
  const s = o.summary;
  return {
    month,
    /** false until the first posting day sets start_date. */
    started: hasStarted(creator),
    today: creatorToday(creator, now),
    expectedWeekdays: s.expectedWeekdays,
    calendarWeekdays: s.calendarWeekdays,
    postedDays: s.postedDays,
    approvedOffDays: s.approvedOffDays,
    missedDays: s.missedDays,
    pendingDays: s.pendingDays,
    completedMonthsBefore: s.completedMonthsBefore,
    levelBaseCents: s.levelBaseCents,
    baseDueCents: s.baseDueCents,
    /** v2 trial days this month and their pay ($15 each). */
    trialDays: s.trialDays,
    trialCents: s.trialCents,
    bonusLines: s.bonusLines,
    adjustmentLines: s.adjustmentLines,
    bonusCents: s.bonusLines.reduce((a, l) => a + l.amount_cents, 0),
    totalCents: s.totalCents,
    nextLevel: o.nextLevel,
    trial: o.trial,
    days: monthDayStates(creator, month, history, now),
  };
}
