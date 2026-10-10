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
  Invoice,
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
 * ($15 a day, $300 in all), with no bonuses. After the 20th the trial is
 * complete and nothing is expected until the founder decides: "keep" starts
 * the normal plan (5 videos, monthly base, bonuses, ladder) on the next
 * weekday after the decision; "end" ends the agreement at the 20th day.
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
  /** The 20th trial day, once reached. */
  completedOn: YyyyMmDd | null;
  /** First weekday on the full plan, once the founder chose "keep". */
  promotedOn: YyyyMmDd | null;
  /** The founder chose "end": the agreement ended on completedOn. */
  ended: boolean;
  /** All 20 days done, no decision yet. */
  reviewing: boolean;
}

type TrialProfile = Pick<PayProfile, "start_date" | "trial_plan"> &
  Partial<Pick<PayProfile, "ended_on" | "trial_outcome" | "trial_decided_on">>;

/** The v2 trial for this profile, or null on the original plan. */
export function trialWindow(profile: TrialProfile | undefined, postingDays: PostingDay[]): TrialWindow | null {
  if (profile?.trial_plan !== "v2") return null;
  const days = [...weekdayCounts(postingDays)]
    .filter(([d, n]) => n >= TRIAL_V2_VIDEOS && d >= profile.start_date && (!profile.ended_on || d <= profile.ended_on))
    .map(([d]) => d)
    .sort()
    .slice(0, TRIAL_V2_DAYS);
  const completedOn = days.length === TRIAL_V2_DAYS ? days[TRIAL_V2_DAYS - 1] : null;
  const outcome = completedOn ? profile.trial_outcome : undefined;
  const decided = profile.trial_decided_on && completedOn && profile.trial_decided_on > completedOn ? profile.trial_decided_on : completedOn;
  return {
    days,
    completedOn,
    promotedOn: outcome === "keep" && decided ? nextWeekday(decided) : null,
    ended: outcome === "end",
    reviewing: !!completedOn && !outcome,
  };
}

/**
 * Is `date` a weekday the creator is expected to post? False before start,
 * after ended_on, and for a v2 creator between the 20th trial day and the
 * promotion date (or after it, when ended or still waiting on a decision).
 */
export function isScheduledDay(profile: TrialProfile, postingDays: PostingDay[], date: YyyyMmDd): boolean {
  if (!isWeekday(date) || date < profile.start_date || (profile.ended_on && date > profile.ended_on)) return false;
  const tw = trialWindow(profile, postingDays);
  if (!tw?.completedOn || date <= tw.completedOn) return true;
  return !!tw.promotedOn && date >= tw.promotedOn;
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
  // After the 20th trial day nothing counts until the promotion date.
  const gap = (d: YyyyMmDd) => !!tw?.completedOn && d > tw.completedOn && (!tw.promotedOn || d < tw.promotedOn);
  const out = new Set<YyyyMmDd>();
  for (const [d, n] of weekdayCounts(postingDays)) if (n >= need(d) && !gap(d)) out.add(d);
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
  completedOn?: YyyyMmDd;
  /** All 20 days done, waiting for the founder's decision. */
  reviewing?: boolean;
  /** The founder chose not to continue. */
  ended?: boolean;
} {
  const tw = trialWindow(profile, postingDays);
  if (tw) {
    return {
      postedDays: tw.days.length,
      isInTrial: !tw.promotedOn && !tw.ended,
      ...(tw.completedOn ? { trialEndsAfterDate: tw.completedOn, completedOn: tw.completedOn } : {}),
      ...(tw.promotedOn ? { promotedOn: tw.promotedOn } : {}),
      ...(tw.reviewing ? { reviewing: true } : {}),
      ...(tw.ended ? { ended: true } : {}),
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

/** A v2 profile seen from the trial: it stops at the 20th trial day. */
function trialPart(profile: PayProfile, tw: TrialWindow): PayProfile {
  if (!tw.completedOn || (profile.ended_on && profile.ended_on < tw.completedOn)) return profile;
  return { ...profile, ended_on: tw.completedOn };
}

function addAttendance(x: MonthAttendance, y: MonthAttendance): MonthAttendance {
  const expectedWeekdays = x.expectedWeekdays + y.expectedWeekdays;
  const missedDays = x.missedDays + y.missedDays;
  const pendingDays = x.pendingDays + y.pendingDays;
  const fullMonth = expectedWeekdays === x.calendarWeekdays && x.calendarWeekdays > 0;
  return {
    calendarWeekdays: x.calendarWeekdays,
    expectedWeekdays,
    postedDays: x.postedDays + y.postedDays,
    approvedOffDays: x.approvedOffDays + y.approvedOffDays,
    missedDays,
    pendingDays,
    fullMonth,
    completed: fullMonth && missedDays === 0 && pendingDays === 0,
  };
}

// ---------------------------------------------------------------- bonuses

/**
 * The bonus timing cutover. Videos first posted ON or AFTER this date follow
 * the hit-month rule: each milestone is paid on the invoice for the month it
 * was hit (100K hit in October: October invoice, paid early November; the
 * same video's 1M hit in November: the other $85 on the November invoice).
 * Videos posted BEFORE it keep the old rule: one line at the video's final
 * level on the invoice for the month after posting (Isai's September videos:
 * the October invoice, paid early November).
 */
export const BONUS_HIT_MONTH_RULE_FROM: YyyyMmDd = "2026-10-01";
const BONUS_RULE_CUTOVER_MONTH: YyyyMm = monthOf(BONUS_HIT_MONTH_RULE_FROM);

export type BonusRule = "old" | "new";

/** Which timing rule a video follows, by its posting date. */
export function bonusRuleFor(postedOn: YyyyMmDd): BonusRule {
  return postedOn < BONUS_HIT_MONTH_RULE_FROM ? "old" : "new";
}

/** One video on one platform, merged from its approved claims. */
export interface BonusVideo {
  /** "platform|url": the same key invoice lines are matched on. */
  key: string;
  platform: Platform;
  url: string;
  posted: YyyyMmDd;
  /** 100K / 1M dates, only when hit inside the 30-day window. */
  c100?: YyyyMmDd;
  c1m?: YyyyMmDd;
}

/** One payable step of a video's bonus: what it pays and the invoice month it belongs to. */
export interface BonusItem {
  month: YyyyMm;
  cents: Cents;
  milestone: "100k" | "1m" | "1m_rest";
  hitOn?: YyyyMmDd;
  rule: BonusRule;
}

const bonusKey = (platform: string, url: string) => `${platform}|${url.trim()}`;

/**
 * Approved claims grouped per (video_url, platform). A threshold counts only
 * if crossed within 30 days of posted_on (day 30 inclusive); hitting 1M
 * implies 100K no later than that.
 */
export function bonusVideos(claims: BonusClaim[]): BonusVideo[] {
  const groups = new Map<string, { platform: Platform; url: string; posted: YyyyMmDd; c100?: YyyyMmDd; c1m?: YyyyMmDd }>();
  const minDate = (a?: YyyyMmDd, b?: YyyyMmDd) => (!a ? b : !b ? a : a < b ? a : b);
  for (const c of claims) {
    if (c.status !== "approved") continue;
    const key = bonusKey(c.platform, c.video_url);
    const g = groups.get(key) ?? { platform: c.platform, url: c.video_url.trim(), posted: c.posted_on };
    g.posted = minDate(g.posted, c.posted_on)!;
    g.c100 = minDate(g.c100, c.crossed_100k_on);
    g.c1m = minDate(g.c1m, c.crossed_1m_on);
    groups.set(key, g);
  }
  const within = (posted: YyyyMmDd, crossed?: YyyyMmDd) => {
    if (!crossed) return undefined;
    const d = daysBetween(posted, crossed);
    return d >= 0 && d <= BONUS_WINDOW_DAYS ? crossed : undefined;
  };
  const out: BonusVideo[] = [];
  for (const [key, g] of groups) {
    const c1m = within(g.posted, g.c1m);
    const c100 = within(g.posted, minDate(g.c100, g.c1m));
    out.push({ key, platform: g.platform, url: g.url, posted: g.posted, ...(c100 ? { c100 } : {}), ...(c1m ? { c1m } : {}) });
  }
  return out;
}

/**
 * What a video pays and on which invoice month.
 * Old rule: one item at its final level, on the month after posting.
 * New rule: each milestone on the month it was hit; both in the same month
 * is one $100 item, otherwise $15 then $85.
 */
export function bonusItems(v: BonusVideo): BonusItem[] {
  if (bonusRuleFor(v.posted) === "old") {
    const month = addMonths(monthOf(v.posted), 1);
    if (v.c1m) return [{ month, cents: BONUS_1M_TOTAL_CENTS, milestone: "1m", hitOn: v.c1m, rule: "old" }];
    if (v.c100) return [{ month, cents: BONUS_100K_CENTS, milestone: "100k", hitOn: v.c100, rule: "old" }];
    return [];
  }
  if (v.c1m && (!v.c100 || monthOf(v.c100) === monthOf(v.c1m))) {
    return [{ month: monthOf(v.c1m), cents: BONUS_1M_TOTAL_CENTS, milestone: "1m", hitOn: v.c1m, rule: "new" }];
  }
  const items: BonusItem[] = [];
  if (v.c100) items.push({ month: monthOf(v.c100), cents: BONUS_100K_CENTS, milestone: "100k", hitOn: v.c100, rule: "new" });
  if (v.c1m) items.push({ month: monthOf(v.c1m), cents: BONUS_1M_TOTAL_CENTS - BONUS_100K_CENTS, milestone: "1m_rest", hitOn: v.c1m, rule: "new" });
  return items;
}

const BONUS_LABEL = /^(1M|100K) views bonus: (TikTok|Instagram) video posted (\d{4}-\d{2}-\d{2}) \((.+)\)$/;

/** The video a bonus invoice line pays for ("platform|url"), from its fields or, on older lines, its label. */
export function bonusLineKey(l: InvoiceLine): string | null {
  if (!String(l.kind).startsWith("bonus")) return null;
  if (l.platform && l.video_url) return bonusKey(l.platform, l.video_url);
  const m = BONUS_LABEL.exec(l.label);
  return m ? bonusKey(m[2] === "TikTok" ? "tiktok" : "instagram", m[4]) : null;
}

/** An invoice as far as the bonus rule needs it. */
export type FrozenInvoice = Pick<Invoice, "month" | "status" | "lines">;

/**
 * Bonus lines payable on the invoice for `month`. Only APPROVED claims; per
 * (video_url, platform); the 30-day window applies (see bonusItems for which
 * month each step lands on).
 *
 * `invoices` (the creator's invoices, optional): a submitted, approved or
 * paid invoice never changes, so from the cutover month on, an item whose
 * month's invoice was already frozen without it (a claim approved late) moves
 * to the next invoice that is still open, and whatever a frozen invoice
 * already paid for a video is never paid again. Months before the cutover
 * are left exactly as they were.
 */
export function bonusLinesForMonth(claims: BonusClaim[], month: YyyyMm, invoices: FrozenInvoice[] = []): InvoiceLine[] {
  const frozen = invoices.filter((i) => i.status !== "draft" && i.month !== month && i.month >= BONUS_RULE_CUTOVER_MONTH && i.month < month);
  const frozenMonths = new Set(frozen.map((i) => i.month));
  // video key -> month -> cents a frozen invoice paid for it
  const paid = new Map<string, Map<YyyyMm, Cents>>();
  for (const inv of frozen) {
    for (const l of inv.lines ?? []) {
      const k = bonusLineKey(l);
      if (!k) continue;
      const byMonth = paid.get(k) ?? new Map<YyyyMm, Cents>();
      byMonth.set(inv.month, (byMonth.get(inv.month) ?? 0) + l.amount_cents);
      paid.set(k, byMonth);
    }
  }
  const platformName = (p: Platform) => (p === "tiktok" ? "TikTok" : "Instagram");
  const lines: InvoiceLine[] = [];
  for (const v of bonusVideos(claims)) {
    const items = bonusItems(v);
    if (!items.length) continue;
    let cents: Cents;
    if (month < BONUS_RULE_CUTOVER_MONTH) {
      // Before the cutover: exactly the old rule, never re-examined.
      cents = items.filter((x) => x.month === month).reduce((a, x) => a + x.cents, 0);
    } else {
      // Walk the months from the cutover to `month`: a frozen month pays what
      // its invoice holds; anything due there but missing carries forward to
      // the next open invoice, and an overpayment carries forward as a credit.
      const counted = items.filter((x) => x.month >= BONUS_RULE_CUTOVER_MONTH);
      const firstItem = counted.map((x) => x.month).sort()[0];
      const firstPaid = [...(paid.get(v.key)?.keys() ?? [])].sort()[0];
      const from = [firstItem, firstPaid].filter(Boolean).sort()[0];
      cents = 0;
      if (from && from <= month) {
        let carry = 0;
        for (let m = from; m <= month; m = addMonths(m, 1)) {
          const due = counted.filter((x) => x.month === m).reduce((a, x) => a + x.cents, 0);
          if (m === month) {
            cents = Math.max(0, carry + due);
          } else if (frozenMonths.has(m)) {
            carry += due - (paid.get(v.key)?.get(m) ?? 0);
          } else {
            // Still open: that month's own invoice pays it.
            carry = Math.min(0, carry + due);
          }
        }
      }
    }
    if (cents <= 0) continue;
    // Describe the latest step this line pays.
    const step = items.filter((x) => x.month <= month).sort((a, b) => a.month.localeCompare(b.month)).pop() ?? items[0];
    // A $85 step that also carries its late $15 is the whole $100.
    const milestone: BonusItem["milestone"] = step.milestone === "1m_rest" && cents >= BONUS_1M_TOTAL_CENTS ? "1m" : step.milestone;
    const what = `${platformName(v.platform)} video posted ${v.posted} (${v.url})`;
    lines.push({
      kind: milestone === "100k" ? "bonus_100k" : milestone === "1m_rest" ? "bonus_1m_topup" : "bonus_1m",
      label: `${milestone === "100k" ? "100K" : "1M"} views bonus: ${what}`,
      amount_cents: cents,
      video_url: v.url,
      platform: v.platform,
      posted_on: v.posted,
      milestone,
      ...(step.hitOn ? { hit_on: step.hitOn } : {}),
      rule: step.rule,
    });
  }
  return lines.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Bonus cost of a WORK month (founder reports): what the month's work earned
 * under the rule that pays it. New-rule milestones count in the month they
 * were hit (= the invoice they're on); old-rule videos count in their posting
 * month (their invoice is the month after).
 */
export function bonusCostForMonth(claims: BonusClaim[], month: YyyyMm): Cents {
  let cents = 0;
  for (const v of bonusVideos(claims)) {
    for (const x of bonusItems(v)) {
      const workMonth = x.rule === "old" ? addMonths(x.month, -1) : x.month;
      if (workMonth === month) cents += x.cents;
    }
  }
  return cents;
}

/**
 * When a milestone's bonus is paid: the first of the month after its invoice
 * month ("2026-11" for a 100K hit in October on a new-rule video; for an
 * old-rule video, two months after posting).
 */
export function bonusPayoutMonth(postedOn: YyyyMmDd, hitOn: YyyyMmDd): YyyyMm {
  return bonusRuleFor(postedOn) === "old" ? addMonths(monthOf(postedOn), 2) : addMonths(monthOf(hitOn), 1);
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
 * Pass `opts.invoices` (the creator's invoices) so bonuses respect invoices
 * that are already frozen (see bonusLinesForMonth).
 */
export function monthSummary(
  profile: PayProfile,
  month: YyyyMm,
  postingDays: PostingDay[],
  daysOff: DayOff[],
  bonusClaims: BonusClaim[],
  adjustments: Adjustment[],
  opts: { today?: YyyyMmDd; invoices?: FrozenInvoice[] } = {},
): MonthSummary {
  const posted = postedWeekdaySet(postingDays, profile);
  const off = approvedOffSet(daysOff);
  // v2: trial days pay $15 each; base, ladder and bonuses count from promotion.
  // The weekdays between the 20th trial day and promotion aren't expected at all.
  const tw = trialWindow(profile, postingDays);
  const full = fullPlanProfile(profile, tw);
  const b = attendance(full, month, posted, off, opts.today);
  const a = tw ? addAttendance(attendance(trialPart(profile, tw), month, posted, new Set(), opts.today), b) : b;
  const trialDays = tw ? tw.days.filter((d) => monthOf(d) === month).length : 0;
  const trialCents = trialDays * TRIAL_V2_DAY_CENTS;
  const completedMonthsBefore = completedMonthsAsOf(full, month);
  const levelBaseCents = baseForCompletedMonths(completedMonthsBefore);
  const credited = b.postedDays + b.approvedOffDays;
  const baseDueCents = b.calendarWeekdays ? Math.round((levelBaseCents * credited) / b.calendarWeekdays) : 0;
  const claims = tw ? (tw.promotedOn ? bonusClaims.filter((c) => c.posted_on >= tw.promotedOn!) : []) : bonusClaims;
  const bonusLines = bonusLinesForMonth(claims, month, opts.invoices);
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
  /** v2 trial progress after this day ("day 7 of 20"); complete = this was the 20th. */
  trial?: { day: number; of: number; totalCents: Cents; complete: boolean };
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
    ...(tw ? { trial: { day: tw.days.length, of: TRIAL_V2_DAYS, totalCents: TRIAL_V2_TOTAL_CENTS, complete: trialDay && !!tw.completedOn } } : {}),
    monthBaseCents: s.levelBaseCents,
    streak: postingStreak(profile, after, daysOff, date),
    nextLevel: nl.nextBaseCents !== null && nl.earliestMonth ? { nextBaseCents: nl.nextBaseCents, earliestMonth: nl.earliestMonth } : null,
  };
}
