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

/**
 * Trial v2 (profiles with trial_plan "v2"): the first TRIAL_V2_DAYS posted
 * weekdays need TRIAL_V2_VIDEOS videos each and pay TRIAL_V2_DAY_CENTS each
 * ($15 a day, $300 in all), with no bonuses. The next weekday after the 20th
 * is the promotion date: from then on it's the normal plan (5 videos, monthly
 * base, bonuses), with the ladder counting from the promotion date.
 */
export const TRIAL_V2_DAYS = 20;
export const TRIAL_V2_VIDEOS = 3;
export const TRIAL_V2_DAY_CENTS = 1500;
export const TRIAL_V2_TOTAL_CENTS = TRIAL_V2_DAYS * TRIAL_V2_DAY_CENTS;

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

/** Complete videos per weekday (duplicate docs for the same date merged). */
function weekdayCounts(postingDays: PostingDay[]): Map<YyyyMmDd, number> {
  const counts = new Map<YyyyMmDd, number>();
  for (const p of postingDays) {
    if (!isWeekday(p.date)) continue;
    counts.set(p.date, (counts.get(p.date) ?? 0) + completeVideoCount(p));
  }
  return counts;
}

function nextWeekday(d: YyyyMmDd): YyyyMmDd {
  let t = parseDate(d) + DAY_MS;
  while (!isWeekday(fmtDate(t))) t += DAY_MS;
  return fmtDate(t);
}

export interface TrialWindow {
  /** The trial's posted weekdays so far, oldest first (at most TRIAL_V2_DAYS). */
  days: YyyyMmDd[];
  /** First weekday on the full plan; null while still in the trial. */
  promotedOn: YyyyMmDd | null;
}

type TrialProfile = Pick<PayProfile, "start_date" | "trial_plan"> & Partial<Pick<PayProfile, "ended_on">>;

/** The v2 trial for this profile, or null on the original plan. */
export function trialWindow(profile: TrialProfile | undefined, postingDays: PostingDay[]): TrialWindow | null {
  if (profile?.trial_plan !== "v2") return null;
  const days = [...weekdayCounts(postingDays)]
    .filter(([d, n]) => n >= TRIAL_V2_VIDEOS && d >= profile.start_date && (!profile.ended_on || d <= profile.ended_on))
    .map(([d]) => d)
    .sort()
    .slice(0, TRIAL_V2_DAYS);
  return { days, promotedOn: days.length === TRIAL_V2_DAYS ? nextWeekday(days[TRIAL_V2_DAYS - 1]) : null };
}

/** Videos a weekday needs to count: 3 during a v2 trial, else 5. */
export function videosRequiredOn(profile: TrialProfile | undefined, postingDays: PostingDay[], date: YyyyMmDd): number {
  const tw = trialWindow(profile, postingDays);
  if (!tw || (tw.promotedOn && date >= tw.promotedOn)) return VIDEOS_PER_WEEKDAY;
  return TRIAL_V2_VIDEOS;
}

/**
 * Weekday dates with enough videos posted on BOTH platforms: 5, or 3 on the
 * days before a v2 creator's promotion.
 */
function postedWeekdaySet(postingDays: PostingDay[], profile?: TrialProfile): Set<YyyyMmDd> {
  const tw = trialWindow(profile, postingDays);
  const need = (d: YyyyMmDd) => (!tw || (tw.promotedOn && d >= tw.promotedOn) ? VIDEOS_PER_WEEKDAY : TRIAL_V2_VIDEOS);
  const out = new Set<YyyyMmDd>();
  for (const [d, n] of weekdayCounts(postingDays)) if (n >= need(d)) out.add(d);
  return out;
}

function approvedOffSet(daysOff: DayOff[]): Set<YyyyMmDd> {
  return new Set(daysOff.filter((d) => d.status === "approved" && isWeekday(d.date)).map((d) => d.date));
}

export function trialStatus(
  postingDays: PostingDay[],
  profile?: TrialProfile,
): {
  postedDays: number;
  isInTrial: boolean;
  trialEndsAfterDate?: YyyyMmDd;
  /** v2 only: the trial's length, videos per trial day, pay per trial day, and the promotion date. */
  plan?: "v2";
  requiredDays?: number;
  videosPerDay?: number;
  dayCents?: Cents;
  totalCents?: Cents;
  promotedOn?: YyyyMmDd;
} {
  const tw = trialWindow(profile, postingDays);
  if (tw) {
    return {
      postedDays: tw.days.length,
      isInTrial: !tw.promotedOn,
      ...(tw.promotedOn ? { trialEndsAfterDate: tw.days[TRIAL_V2_DAYS - 1], promotedOn: tw.promotedOn } : {}),
      plan: "v2",
      requiredDays: TRIAL_V2_DAYS,
      videosPerDay: TRIAL_V2_VIDEOS,
      dayCents: TRIAL_V2_DAY_CENTS,
      totalCents: TRIAL_V2_TOTAL_CENTS,
    };
  }
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
  if (profile.trial_plan === "v2" && history) profile = fullPlanProfile(profile, trialWindow(profile, history.postingDays));
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
  if (profile.trial_plan === "v2") profile = fullPlanProfile(profile, trialWindow(profile, history.postingDays));
  const next = BASE_LADDER.find(([t]) => t > have);
  if (!next) return { nextBaseCents: null, monthsNeeded: null, earliestMonth: null };
  const monthsNeeded = next[0] - have;
  // Still in a v2 trial: the ladder hasn't started, so there's no date yet.
  if (profile.start_date === NEVER) return { nextBaseCents: next[1], monthsNeeded, earliestMonth: null };
  // A partial first month never counts, so counting starts the month after.
  const startMonth = monthOf(profile.start_date);
  let firstCountable = asOfMonth > startMonth ? asOfMonth : startMonth;
  const none = new Set<YyyyMmDd>();
  if (firstCountable === startMonth && !attendance(profile, startMonth, none, none).fullMonth) {
    firstCountable = addMonths(startMonth, 1);
  }
  return { nextBaseCents: next[1], monthsNeeded, earliestMonth: addMonths(firstCountable, monthsNeeded) };
}

/**
 * A v2 profile seen from the full plan: it starts on the promotion date (or
 * never, while in the trial), so base pay, the ladder and bonuses all count
 * from promotion.
 */
function fullPlanProfile(profile: PayProfile, tw: TrialWindow | null): PayProfile {
  if (!tw) return profile;
  return { ...profile, start_date: tw.promotedOn ?? NEVER };
}

const NEVER = "9999-12-31";

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
  // Bonuses are paid one month after posting: videos first posted in month M
  // are settled on the invoice for M+1, once every one of their 30-day
  // windows has closed. One line per video and platform, at its final level.
  const lines: InvoiceLine[] = [];
  for (const g of groups.values()) {
    if (addMonths(monthOf(g.posted), 1) !== month) continue;
    // Hitting 1M implies having hit 100K no later than that.
    const c100 = minDate(g.c100, g.c1m);
    const q100 = within(g.posted, c100);
    const q1m = within(g.posted, g.c1m);
    const what = `${platformName(g.platform)} video posted ${g.posted} (${g.url})`;
    if (q1m) {
      lines.push({ kind: "bonus_1m", label: `1M views bonus: ${what}`, amount_cents: BONUS_1M_TOTAL_CENTS });
    } else if (q100) {
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
  /** v2 trial days posted in this month, and what they pay ($15 each). 0 otherwise. */
  trialDays: number;
  trialCents: Cents;
  /** Weekdays of this month on the full plan (all of them, unless a v2 trial covers some). */
  baseExpectedWeekdays: number;
  /** Weekdays credited toward base pay (posted + approved off; after promotion for v2). */
  baseCreditedDays: number;
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
  const posted = postedWeekdaySet(postingDays, profile);
  const off = approvedOffSet(daysOff);
  const a = attendance(profile, month, posted, off, opts.today);
  // v2: trial days pay $15 each; base, ladder and bonuses count from promotion.
  const tw = trialWindow(profile, postingDays);
  const full = fullPlanProfile(profile, tw);
  const b = tw ? attendance(full, month, posted, off, opts.today) : a;
  const trialDays = tw ? tw.days.filter((d) => monthOf(d) === month).length : 0;
  const trialCents = trialDays * TRIAL_V2_DAY_CENTS;
  const completedMonthsBefore = completedMonthsAsOf(full, month);
  const levelBaseCents = baseForCompletedMonths(completedMonthsBefore);
  const credited = b.postedDays + b.approvedOffDays;
  const baseDueCents = b.calendarWeekdays ? Math.round((levelBaseCents * credited) / b.calendarWeekdays) : 0;
  const claims = tw ? (tw.promotedOn ? bonusClaims.filter((c) => c.posted_on >= tw.promotedOn!) : []) : bonusClaims;
  const bonusLines = bonusLinesForMonth(claims, month);
  const adjustmentLines: InvoiceLine[] = adjustments
    .filter((x) => x.month === month)
    .map((x) => ({ kind: "adjustment", label: x.note || "Adjustment", amount_cents: Math.round(x.amount_cents) }));
  const totalCents =
    trialCents +
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
    trialDays,
    trialCents,
    baseExpectedWeekdays: b.expectedWeekdays,
    baseCreditedDays: credited,
    bonusLines,
    adjustmentLines,
    totalCents,
  };
}

export function draftInvoiceLines(summary: MonthSummary): InvoiceLine[] {
  const trialDays = summary.trialDays ?? 0;
  const credited = summary.baseCreditedDays ?? summary.postedDays + summary.approvedOffDays;
  const lines: InvoiceLine[] = [];
  if (trialDays > 0) {
    lines.push({
      kind: "trial",
      label: `Trial ${fmtMonth(summary.month)}: ${trialDays} posting day${trialDays === 1 ? "" : "s"} at ${fmtUsd(TRIAL_V2_DAY_CENTS)}/day`,
      amount_cents: summary.trialCents,
    });
  }
  // A month that's all trial has no base line.
  if (summary.baseDueCents !== 0 || (summary.baseExpectedWeekdays ?? summary.expectedWeekdays) > 0) {
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

// ---------------------------------------------------------------- day complete

/** What one posted weekday adds to base pay at `levelBaseCents` in `month`. */
export function dayPayCents(levelBaseCents: Cents, month: YyyyMm): Cents {
  const n = weekdaysInMonth(month);
  return n ? Math.round(levelBaseCents / n) : 0;
}

/** True if `date` counts as a posted weekday (5 videos on both platforms). */
export function isPostedDay(postingDays: PostingDay[], date: YyyyMmDd, profile?: TrialProfile): boolean {
  return postedWeekdaySet(postingDays, profile).has(date);
}

/**
 * Posted weekdays in a row ending on `date`. Weekends are skipped, approved
 * days off are skipped without breaking the run, and the run stops at
 * start_date. 0 when `date` itself isn't posted.
 */
export function postingStreak(
  profile: TrialProfile,
  postingDays: PostingDay[],
  daysOff: DayOff[],
  date: YyyyMmDd,
): number {
  const posted = postedWeekdaySet(postingDays, profile);
  const off = approvedOffSet(daysOff);
  let n = 0;
  for (let t = parseDate(date); ; t -= DAY_MS) {
    const d = fmtDate(t);
    if (d < profile.start_date) break;
    if (!isWeekday(d)) continue;
    if (posted.has(d)) n++;
    else if (off.has(d)) continue;
    else break;
  }
  return n;
}

export interface DayComplete {
  date: YyyyMmDd;
  dayPayCents: Cents;
  /** Base earned so far this month (monthSummary.baseDueCents). */
  monthEarnedCents: Cents;
  /** The full month's base at the current level. */
  monthBaseCents: Cents;
  streak: number;
  nextLevel: { nextBaseCents: Cents; earliestMonth: YyyyMm } | null;
  /** v2 trial progress after this day ("day 7 of 20"); promoted = this was the 20th. */
  trial?: { day: number; of: number; totalCents: Cents; promoted: boolean };
}

/**
 * The numbers for the end-of-day screen, or null unless `date` went from not
 * counted (`before`) to counted (`after`) and is a paid weekday in the
 * creator's active window that wasn't already credited as a day off.
 * `before`/`after` are the creator's full posting history around one save.
 */
export function dayComplete(
  profile: PayProfile,
  date: YyyyMmDd,
  before: PostingDay[],
  after: PostingDay[],
  daysOff: DayOff[],
): DayComplete | null {
  if (!isWeekday(date) || date < profile.start_date || (profile.ended_on && date > profile.ended_on)) return null;
  if (isPostedDay(before, date, profile) || !isPostedDay(after, date, profile)) return null;
  if (approvedOffSet(daysOff).has(date)) return null;
  const month = monthOf(date);
  const s = monthSummary(profile, month, after, daysOff, [], [], { today: date });
  const tw = trialWindow(profile, after);
  const trialDay = !!tw && tw.days.includes(date);
  const nl = nextLevel(profile, { postingDays: after, daysOff }, month);
  return {
    date,
    dayPayCents: trialDay ? TRIAL_V2_DAY_CENTS : dayPayCents(s.levelBaseCents, month),
    monthEarnedCents: s.trialCents + s.baseDueCents,
    ...(tw ? { trial: { day: tw.days.length, of: TRIAL_V2_DAYS, totalCents: TRIAL_V2_TOTAL_CENTS, promoted: trialDay && !!tw.promotedOn } } : {}),
    monthBaseCents: s.levelBaseCents,
    streak: postingStreak(profile, after, daysOff, date),
    nextLevel: nl.nextBaseCents !== null && nl.earliestMonth ? { nextBaseCents: nl.nextBaseCents, earliestMonth: nl.earliestMonth } : null,
  };
}
