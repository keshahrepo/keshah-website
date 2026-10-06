/**
 * Creator pay calculator. PURE: no Firestore, no clock. Every "today"/date is
 * passed in. All dates are creator-local "yyyy-mm-dd", months "yyyy-mm",
 * money integer cents.
 *
 * Core formula for a month:
 *   baseDue = round(levelBase × creditedWeekdays ÷ weekdaysInCalendarMonth)
 * where creditedWeekdays = posted weekdays + approved days off inside the
 * creator's active window (start_date .. ended_on). This single formula covers
 * the partial first month, missed days and the leaving month.
 *
 * Ladder: the level is set by months ELAPSED since start_date (plus
 * starting_completed_months), not by attendance. Missed days cost money via
 * the proration above but never delay a raise. A partial first month doesn't
 * count; a start on the month's first weekday counts once that month ends.
 */
import type {
  Adjustment,
  BonusClaim,
  Cents,
  DayOff,
  InvoiceLine,
  PayProfile,
  Platform,
  PostingDay,
  YyyyMm,
  YyyyMmDd,
} from "./types";

/** Unique videos per weekday, each posted on BOTH TikTok and Instagram. */
export const VIDEOS_PER_WEEKDAY = 5;
export const TRIAL_POSTED_DAYS = 10;
export const BONUS_WINDOW_DAYS = 30;
export const BONUS_100K_CENTS = 1500;
export const BONUS_1M_TOTAL_CENTS = 10000;

/** [completed months threshold, monthly base cents], ascending. */
export const BASE_LADDER: ReadonlyArray<readonly [number, Cents]> = [
  [0, 50000],
  [1, 65000],
  [4, 80000],
  [8, 95000],
  [12, 110000],
];

export interface PayHistory {
  postingDays: PostingDay[];
  daysOff: DayOff[];
}

// ---------------------------------------------------------------- date utils

const DAY_MS = 86400000;

function parseDate(d: YyyyMmDd): number {
  const [y, m, day] = d.split("-").map(Number);
  return Date.UTC(y, m - 1, day);
}

function fmtDate(ms: number): YyyyMmDd {
  return new Date(ms).toISOString().slice(0, 10);
}

export function monthOf(d: YyyyMmDd): YyyyMm {
  return d.slice(0, 7);
}

export function addMonths(month: YyyyMm, n: number): YyyyMm {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

function monthFirst(month: YyyyMm): YyyyMmDd {
  return `${month}-01`;
}

function monthLast(month: YyyyMm): YyyyMmDd {
  return fmtDate(parseDate(monthFirst(addMonths(month, 1))) - DAY_MS);
}

export function isWeekday(d: YyyyMmDd): boolean {
  const dow = new Date(parseDate(d)).getUTCDay();
  return dow >= 1 && dow <= 5;
}

function daysBetween(a: YyyyMmDd, b: YyyyMmDd): number {
  return Math.round((parseDate(b) - parseDate(a)) / DAY_MS);
}

/** Weekdays (Mon–Fri) in [from, to] inclusive, as dates. */
export function weekdaysBetween(from: YyyyMmDd, to: YyyyMmDd): YyyyMmDd[] {
  const out: YyyyMmDd[] = [];
  for (let t = parseDate(from), end = parseDate(to); t <= end; t += DAY_MS) {
    const d = fmtDate(t);
    if (isWeekday(d)) out.push(d);
  }
  return out;
}

export function weekdaysInMonth(month: YyyyMm): number {
  return weekdaysBetween(monthFirst(month), monthLast(month)).length;
}

function fmtMonth(month: YyyyMm): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [y, m] = month.split("-").map(Number);
  return `${names[m - 1]} ${y}`;
}

function fmtUsd(cents: Cents): string {
  const sign = cents < 0 ? "-" : "";
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** Local calendar date of an instant in an IANA zone. */
export function localDate(iso: string, timezone: string): YyyyMmDd {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/**
 * True if `loggedAtIso` falls on or before `date` (end of day, 11:59:59 pm)
 * in the creator's `timezone`.
 */
export function isOnTime(loggedAtIso: string, date: YyyyMmDd, timezone: string): boolean {
  return localDate(loggedAtIso, timezone) <= date;
}

// ---------------------------------------------------------------- posting

/** A video counts only when it was logged on BOTH TikTok and Instagram. */
export function isCompleteVideo(v: { tiktok_url?: string; instagram_url?: string } | null | undefined): boolean {
  return !!v && !!v.tiktok_url?.trim() && !!v.instagram_url?.trim();
}

/** Number of videos in a day's log posted on both platforms. */
export function completeVideoCount(day: Pick<PostingDay, "videos">): number {
  return (day.videos ?? []).filter(isCompleteVideo).length;
}

/**
 * Weekday dates with >= VIDEOS_PER_WEEKDAY videos posted on BOTH platforms
 * (duplicate docs for the same date merged).
 */
function postedWeekdaySet(postingDays: PostingDay[]): Set<YyyyMmDd> {
  const counts = new Map<YyyyMmDd, number>();
  for (const p of postingDays) {
    counts.set(p.date, (counts.get(p.date) ?? 0) + completeVideoCount(p));
  }
  const out = new Set<YyyyMmDd>();
  for (const [d, n] of counts) if (n >= VIDEOS_PER_WEEKDAY && isWeekday(d)) out.add(d);
  return out;
}

function approvedOffSet(daysOff: DayOff[]): Set<YyyyMmDd> {
  return new Set(daysOff.filter((d) => d.status === "approved" && isWeekday(d.date)).map((d) => d.date));
}

export function trialStatus(postingDays: PostingDay[]): {
  postedDays: number;
  isInTrial: boolean;
  trialEndsAfterDate?: YyyyMmDd;
} {
  const posted = [...postedWeekdaySet(postingDays)].sort();
  const isInTrial = posted.length < TRIAL_POSTED_DAYS;
  return {
    postedDays: posted.length,
    isInTrial,
    ...(isInTrial ? {} : { trialEndsAfterDate: posted[TRIAL_POSTED_DAYS - 1] }),
  };
}

// ---------------------------------------------------------------- ladder

export function baseForCompletedMonths(completed: number): Cents {
  let base = BASE_LADDER[0][1];
  for (const [threshold, cents] of BASE_LADDER) if (completed >= threshold) base = cents;
  return base;
}

interface MonthAttendance {
  calendarWeekdays: number;
  expectedWeekdays: number;
  postedDays: number;
  approvedOffDays: number;
  missedDays: number;
  pendingDays: number;
  /** Active window covers every weekday of the calendar month (counts toward the ladder once over). */
  fullMonth: boolean;
  /** Full month with nothing missed or pending. Informational only; does NOT gate the ladder. */
  completed: boolean;
}

function attendance(
  profile: PayProfile,
  month: YyyyMm,
  posted: Set<YyyyMmDd>,
  off: Set<YyyyMmDd>,
  today?: YyyyMmDd,
): MonthAttendance {
  const calendar = weekdaysBetween(monthFirst(month), monthLast(month));
  const expected = calendar.filter(
    (d) => d >= profile.start_date && (!profile.ended_on || d <= profile.ended_on),
  );
  let postedDays = 0, approvedOffDays = 0, missedDays = 0, pendingDays = 0;
  for (const d of expected) {
    if (posted.has(d)) postedDays++;
    else if (off.has(d)) approvedOffDays++;
    else if (today && d >= today) pendingDays++; // today itself still has until 11:59 pm
    else missedDays++;
  }
  const fullMonth = expected.length === calendar.length && calendar.length > 0;
  return {
    calendarWeekdays: calendar.length,
    expectedWeekdays: expected.length,
    postedDays,
    approvedOffDays,
    missedDays,
    pendingDays,
    fullMonth,
    completed: fullMonth && missedDays === 0 && pendingDays === 0,
  };
}

/**
 * Completed months credited BEFORE `month`:
 * starting_completed_months + full calendar months elapsed since start_date,
 * up to (not including) `month`, regardless of attendance (missed days are
 * prorated out of base pay instead). A partial first month doesn't count; a
 * month after ended_on doesn't count. This is what sets `month`'s base level.
 * `history` is accepted for call-site compatibility and ignored.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function completedMonthsAsOf(profile: PayProfile, month: YyyyMm, history?: PayHistory): number {
  const none = new Set<YyyyMmDd>();
  let count = profile.starting_completed_months ?? 0;
  for (let m = monthOf(profile.start_date); m < month; m = addMonths(m, 1)) {
    if (attendance(profile, m, none, none).fullMonth) count++;
  }
  return count;
}

/**
 * Next base level from the perspective of `asOfMonth` (months simply need to
 * elapse; attendance doesn't matter). `earliestMonth` is the first
 * month paid at `nextBaseCents`. Null fields when already at the top.
 */
export function nextLevel(
  profile: PayProfile,
  history: PayHistory,
  asOfMonth: YyyyMm,
): { nextBaseCents: Cents | null; monthsNeeded: number | null; earliestMonth: YyyyMm | null } {
  const have = completedMonthsAsOf(profile, asOfMonth, history);
  const next = BASE_LADDER.find(([t]) => t > have);
  if (!next) return { nextBaseCents: null, monthsNeeded: null, earliestMonth: null };
  const monthsNeeded = next[0] - have;
  // A partial first month never counts, so counting starts the month after.
  const startMonth = monthOf(profile.start_date);
  let firstCountable = asOfMonth > startMonth ? asOfMonth : startMonth;
  const none = new Set<YyyyMmDd>();
  if (firstCountable === startMonth && !attendance(profile, startMonth, none, none).fullMonth) {
    firstCountable = addMonths(startMonth, 1);
  }
  return { nextBaseCents: next[1], monthsNeeded, earliestMonth: addMonths(firstCountable, monthsNeeded) };
}

// ---------------------------------------------------------------- bonuses

/**
 * Bonus lines payable in `month`. Per (video_url, platform); only APPROVED
 * claims. A threshold counts only if crossed within 30 days of posted_on
 * (day 30 inclusive). Paid in the month it was crossed.
 */
export function bonusLinesForMonth(claims: BonusClaim[], month: YyyyMm): InvoiceLine[] {
  const groups = new Map<string, { platform: Platform; url: string; posted: YyyyMmDd; c100?: YyyyMmDd; c1m?: YyyyMmDd }>();
  const minDate = (a?: YyyyMmDd, b?: YyyyMmDd) => (!a ? b : !b ? a : a < b ? a : b);
  for (const c of claims) {
    if (c.status !== "approved") continue;
    const key = `${c.platform}|${c.video_url.trim()}`;
    const g = groups.get(key) ?? { platform: c.platform, url: c.video_url.trim(), posted: c.posted_on };
    g.posted = minDate(g.posted, c.posted_on)!;
    g.c100 = minDate(g.c100, c.crossed_100k_on);
    g.c1m = minDate(g.c1m, c.crossed_1m_on);
    groups.set(key, g);
  }
  const within = (posted: YyyyMmDd, crossed?: YyyyMmDd) => {
    if (!crossed) return false;
    const d = daysBetween(posted, crossed);
    return d >= 0 && d <= BONUS_WINDOW_DAYS;
  };
  const platformName = (p: Platform) => (p === "tiktok" ? "TikTok" : "Instagram");
  const lines: InvoiceLine[] = [];
  for (const g of groups.values()) {
    // Hitting 1M implies having hit 100K no later than that.
    const c100 = minDate(g.c100, g.c1m);
    const q100 = within(g.posted, c100);
    const q1m = within(g.posted, g.c1m);
    const what = `${platformName(g.platform)} video posted ${g.posted} (${g.url})`;
    if (q1m && monthOf(g.c1m!) === month) {
      if (q100 && monthOf(c100!) < month) {
        lines.push({ kind: "bonus_1m_topup", label: `1M views bonus top-up: ${what}`, amount_cents: BONUS_1M_TOTAL_CENTS - BONUS_100K_CENTS });
      } else {
        lines.push({ kind: "bonus_1m", label: `1M views bonus: ${what}`, amount_cents: BONUS_1M_TOTAL_CENTS });
      }
    } else if (q100 && monthOf(c100!) === month && !(q1m && monthOf(g.c1m!) === month)) {
      lines.push({ kind: "bonus_100k", label: `100K views bonus: ${what}`, amount_cents: BONUS_100K_CENTS });
    }
  }
  return lines.sort((a, b) => a.label.localeCompare(b.label));
}

// ---------------------------------------------------------------- month

export interface MonthSummary {
  month: YyyyMm;
  calendarWeekdays: number;
  expectedWeekdays: number;
  postedDays: number;
  approvedOffDays: number;
  missedDays: number;
  /** Weekdays on/after `today` not yet posted (only when `today` passed). */
  pendingDays: number;
  completed: boolean;
  completedMonthsBefore: number;
  levelBaseCents: Cents;
  baseDueCents: Cents;
  bonusLines: InvoiceLine[];
  adjustmentLines: InvoiceLine[];
  totalCents: Cents;
}

/**
 * `postingDays` / `daysOff` should be the creator's FULL history (used for
 * the ladder too). Pass `opts.today` for an in-progress month so future
 * weekdays count as pending instead of missed; baseDue is then "earned so far".
 */
export function monthSummary(
  profile: PayProfile,
  month: YyyyMm,
  postingDays: PostingDay[],
  daysOff: DayOff[],
  bonusClaims: BonusClaim[],
  adjustments: Adjustment[],
  opts: { today?: YyyyMmDd } = {},
): MonthSummary {
  const posted = postedWeekdaySet(postingDays);
  const off = approvedOffSet(daysOff);
  const a = attendance(profile, month, posted, off, opts.today);
  const completedMonthsBefore = completedMonthsAsOf(profile, month, { postingDays, daysOff });
  const levelBaseCents = baseForCompletedMonths(completedMonthsBefore);
  const credited = a.postedDays + a.approvedOffDays;
  const baseDueCents = a.calendarWeekdays ? Math.round((levelBaseCents * credited) / a.calendarWeekdays) : 0;
  const bonusLines = bonusLinesForMonth(bonusClaims, month);
  const adjustmentLines: InvoiceLine[] = adjustments
    .filter((x) => x.month === month)
    .map((x) => ({ kind: "adjustment", label: x.note || "Adjustment", amount_cents: Math.round(x.amount_cents) }));
  const totalCents =
    baseDueCents +
    bonusLines.reduce((s, l) => s + l.amount_cents, 0) +
    adjustmentLines.reduce((s, l) => s + l.amount_cents, 0);
  return {
    month,
    calendarWeekdays: a.calendarWeekdays,
    expectedWeekdays: a.expectedWeekdays,
    postedDays: a.postedDays,
    approvedOffDays: a.approvedOffDays,
    missedDays: a.missedDays,
    pendingDays: a.pendingDays,
    completed: a.completed,
    completedMonthsBefore,
    levelBaseCents,
    baseDueCents,
    bonusLines,
    adjustmentLines,
    totalCents,
  };
}

export function draftInvoiceLines(summary: MonthSummary): InvoiceLine[] {
  const credited = summary.postedDays + summary.approvedOffDays;
  const lines: InvoiceLine[] = [];
  if (summary.expectedWeekdays > 0 || summary.baseDueCents !== 0) {
    lines.push({
      kind: "base",
      label: `Base pay ${fmtMonth(summary.month)}: ${credited}/${summary.calendarWeekdays} weekdays at ${fmtUsd(summary.levelBaseCents)}/month`,
      amount_cents: summary.baseDueCents,
    });
  }
  return [...lines, ...summary.bonusLines, ...summary.adjustmentLines];
}

// ---------------------------------------------------------------- invoices

export function creatorPrefix(legalName: string): string {
  return legalName
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}]/gu, "").charAt(0))
    .join("")
    .toUpperCase();
}

export function invoiceNumber(prefix: string, seq: number): string {
  return `${prefix}-${String(seq).padStart(3, "0")}`;
}
