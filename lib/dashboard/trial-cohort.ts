/**
 * Trial cohort maths shared by the web Trial page and the founder app
 * (one definition so the numbers always match). Pure: no Firestore.
 */
import type { DocumentData } from "firebase-admin/firestore";

export const TEST_EMAIL_REGEX = /^test\d+@test\.com$/i;
export const isTestEmail = (email: unknown): boolean =>
  typeof email === "string" && TEST_EMAIL_REGEX.test(email);

export const TRIAL_DAYS = 7;
export const DAY_MS = 86_400_000;

// Days shown in the per-day completion panel: the full trial (1-7)
// plus two post-trial retention beats — Day 10 (3 days into paid) and
// Day 14 (1 week into paid). Skipping 8/9/11/12/13 keeps the panel
// focused on the beats that matter (trial engagement + first
// retention checkpoints).
export const DISPLAYED_DAYS = [1, 2, 3, 4, 5, 6, 7, 10, 14];
export const MAX_TRACKED_DAY = 14;

export type GenderFilter = "all" | "male" | "female";
export const GENDER_TABS: Array<{ key: GenderFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "male", label: "Men" },
  { key: "female", label: "Women" },
];

// ── Shared definitions ──────────────────────────────────────────────
// Paid = converted_trial (first renewal charged). converted_at, pro and
// the paidStoppage tag are written when the TRIAL STARTS, so they are
// never used as "paid" here.
// Mature trial = started_trial.at more than 8 days ago (7-day trial + a
// day for the store renewal to land). Conversion rates are computed
// over mature trials so in-flight trials don't read as "didn't pay".
export const MATURE_MS = 8 * DAY_MS;
export const HOUR_MS = 3_600_000;
// Store renewal windows, hours after trial start. iOS charges ~168h
// after trial start (observed cluster 166–172h), Google Play ~196h
// (194–200h). A cancel stamped inside this window on a non-converted
// trial is almost always the store giving up on a failed renewal charge
// (BILLING_ERROR), not the user. Inferred — the webhook doesn't store
// cancel_reason yet.
export const RENEWAL_WINDOW_H = {
  ios: [160, 176] as const,
  android: [188, 204] as const,
};

export type Outcome = "converted" | "payment_failed" | "cancelled_in_trial" | "still_in_trial" | "other";

// Check-in outcome for one scheduled day (3 or 6). New builds write
// scalp_check_readings [{day, rating, at}] compared against
// scalp_tension_baseline (they also write yes/no into the legacy
// scalp_check_answers, which can't tell "same" from "tighter"). Legacy
// answers are only used for old users with no readings at all.
export type CheckInBucket =
  | "looser" | "same" | "tighter"
  | "legacy_yes" | "legacy_no" | "legacy_not_sure"
  | "skipped_d3_looser"
  | "finished_no_checkin" | "opened_not_finished" | "never_opened";

export interface TrialUser {
  createdMs: number;
  gender: string | undefined;
  startedAtMs: number | null;
  daysCompleted: number;
  perDay: boolean[];
  day1Done: number;
  day1Total: number;
  // null = not in the check-in universe (no baseline and no legacy answers)
  checkIn3: CheckInBucket | null;
  checkIn6: CheckInBucket | null;
  converted: boolean;               // !!converted_trial
  cancelled: boolean;               // subscription_status === "cancelled" (auto-renew turned off)
  cancelledAtMs: number | null;     // subscription_cancelled_at
  isAndroid: boolean;               // started_trial.product_id contains ":" (Play "sub:base-plan")
  // Lifetime revenue on the user doc, accumulated by the RevenueCat webhook
  // from the store's own price / tax / commission figures. Only accrues from
  // 30 Sep 2026, when capture was added, so earlier cohorts read 0.
  revenueUsd: number;
  proceedsUsd: number;
}

export function tsToMs(raw: unknown): number | null {
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    return isNaN(t) ? null : t;
  }
  if (!raw || typeof raw !== "object") return null;
  const t = raw as { toMillis?: () => number; _seconds?: number; seconds?: number };
  if (typeof t.toMillis === "function") return t.toMillis();
  const s = t._seconds ?? t.seconds;
  return typeof s === "number" ? s * 1000 : null;
}

export function isMature(u: TrialUser, now: number): boolean {
  return u.startedAtMs !== null && u.startedAtMs < now - MATURE_MS;
}

export function classifyOutcome(u: TrialUser, now: number): Outcome {
  if (u.converted) return "converted";
  if (u.startedAtMs !== null && u.cancelled && u.cancelledAtMs !== null) {
    const h = (u.cancelledAtMs - u.startedAtMs) / HOUR_MS;
    const [lo, hi] = u.isAndroid ? RENEWAL_WINDOW_H.android : RENEWAL_WINDOW_H.ios;
    if (h >= lo && h <= hi) return "payment_failed";
    if (h < lo) return "cancelled_in_trial";
  }
  if (u.startedAtMs !== null && !isMature(u, now) && !u.cancelled) return "still_in_trial";
  return "other";
}

export const CHECKIN_BUCKETS: CheckInBucket[] = [
  "looser", "same", "tighter",
  "legacy_yes", "legacy_no", "legacy_not_sure",
  "skipped_d3_looser",
  "finished_no_checkin", "opened_not_finished", "never_opened",
];
export interface CheckInStats {
  total: number;
  rows: Record<CheckInBucket, { n: number; paid: number }>;
}
export const emptyCheckIn = (): CheckInStats => ({
  total: 0,
  rows: Object.fromEntries(CHECKIN_BUCKETS.map((b) => [b, { n: 0, paid: 0 }])) as CheckInStats["rows"],
});

// ── Metrics for one cohort ──────────────────────────────────────────

export interface CohortMetrics {
  total: number;
  perDayCounts: number[];
  perDayEligible: number[];
  checkIn3: CheckInStats;
  checkIn6: CheckInStats;
  outcomes: {
    converted: number;
    convertedLaterCancelled: number;
    paymentFailed: number;
    cancelledInTrial: number;
    cancelledFirstHour: number;
    stillInTrial: number;
    other: number;
    mature: number;
    matureConverted: number;
    maturePaymentFailed: number;
    matureCancelledInTrial: number;
    matureOther: number;
  };
  revenueUsd: number;
  proceedsUsd: number;
  funnel: Array<{ key: string; label: string; count: number }>;
  day1Distribution: number[];
  day1NeverOpened: number;
  day1MaxTotal: number;
  genderMale: number;
  genderFemale: number;
  allSignups: number;   // for gender-tab total
}

export function computeMetrics(users: TrialUser[], allSignupsInCohort: number, now: number): CohortMetrics {
  const total = users.length;
  const outcomes: CohortMetrics["outcomes"] = {
    converted: 0, convertedLaterCancelled: 0, paymentFailed: 0,
    cancelledInTrial: 0, cancelledFirstHour: 0, stillInTrial: 0, other: 0,
    mature: 0, matureConverted: 0, maturePaymentFailed: 0,
    matureCancelledInTrial: 0, matureOther: 0,
  };
  for (const u of users) {
    const o = classifyOutcome(u, now);
    const mature = isMature(u, now);
    if (mature) outcomes.mature++;
    if (o === "converted") {
      outcomes.converted++;
      if (u.cancelled) outcomes.convertedLaterCancelled++;
      if (mature) outcomes.matureConverted++;
    } else if (o === "payment_failed") {
      outcomes.paymentFailed++;
      if (mature) outcomes.maturePaymentFailed++;
    } else if (o === "cancelled_in_trial") {
      outcomes.cancelledInTrial++;
      if (mature) outcomes.matureCancelledInTrial++;
      if (u.cancelledAtMs !== null && u.startedAtMs !== null && u.cancelledAtMs - u.startedAtMs < HOUR_MS) {
        outcomes.cancelledFirstHour++;
      }
    } else if (o === "still_in_trial") {
      outcomes.stillInTrial++;
    } else {
      outcomes.other++;
      if (mature) outcomes.matureOther++;
    }
  }
  const converted = outcomes.converted;
  const revenueUsd = users.reduce((a, u) => a + u.revenueUsd, 0);
  const proceedsUsd = users.reduce((a, u) => a + u.proceedsUsd, 0);

  const funnel = [
    { key: "funnel_started",    label: "Trial started",           count: total },
    { key: "funnel_day_gte_1",  label: "Did ≥ 1 day",             count: users.filter((u) => u.daysCompleted >= 1).length },
    { key: "funnel_day_gte_3",  label: "Did ≥ 3 days",            count: users.filter((u) => u.daysCompleted >= 3).length },
    { key: "funnel_day_gte_5",  label: "Did ≥ 5 days",            count: users.filter((u) => u.daysCompleted >= 5).length },
    { key: "funnel_day_all",    label: `Did all ${TRIAL_DAYS} days`, count: users.filter((u) => u.daysCompleted >= TRIAL_DAYS).length },
    { key: "funnel_converted",  label: "Converted to paid",       count: converted },
  ];

  // Track through MAX_TRACKED_DAY (14) so the panel can show Day 10 and
  // Day 14 alongside the trial days. Trial-related metrics (funnel,
  // gradient) still only use days 1..TRIAL_DAYS.
  // Eligible for day N only once day N has fully elapsed for the user
  // (tenure ≥ N whole days since started_trial.at). Previously tenure ≥
  // N-1, which counted users still mid-day as "didn't complete".
  const perDayCounts = new Array(MAX_TRACKED_DAY).fill(0);
  const perDayEligible = new Array(MAX_TRACKED_DAY).fill(0);
  for (const u of users) {
    if (u.startedAtMs === null) continue;
    const tenureDays = Math.floor((now - u.startedAtMs) / DAY_MS);
    for (let i = 0; i < MAX_TRACKED_DAY; i++) {
      if (tenureDays >= i + 1) {
        perDayEligible[i]++;
        if (u.perDay[i]) perDayCounts[i]++;
      }
    }
  }

  let day1MaxTotal = 0;
  for (const u of users) if (u.day1Total > day1MaxTotal) day1MaxTotal = u.day1Total;
  const day1Distribution = new Array(day1MaxTotal + 1).fill(0);
  let day1NeverOpened = 0;
  for (const u of users) {
    if (u.startedAtMs === null) continue;
    // Same eligibility as the Day 1 row: Day 1 fully elapsed.
    if (Math.floor((now - u.startedAtMs) / DAY_MS) < 1) continue;
    if (u.day1Total === 0) { day1NeverOpened++; continue; }
    day1Distribution[u.day1Done] = (day1Distribution[u.day1Done] ?? 0) + 1;
  }

  const checkIn3 = emptyCheckIn();
  const checkIn6 = emptyCheckIn();
  // Check-in cards: mature trials only so conversion per outcome is final.
  for (const u of users) {
    if (!isMature(u, now)) continue;
    for (const [bucket, stats] of [[u.checkIn3, checkIn3], [u.checkIn6, checkIn6]] as const) {
      if (!bucket) continue;
      stats.total++;
      stats.rows[bucket].n++;
      if (u.converted) stats.rows[bucket].paid++;
    }
  }

  return {
    total,
    perDayCounts,
    perDayEligible,
    checkIn3,
    checkIn6,
    outcomes,
    revenueUsd,
    proceedsUsd,
    funnel,
    day1Distribution,
    day1NeverOpened,
    day1MaxTotal,
    genderMale: users.filter((u) => u.gender === "male").length,
    genderFemale: users.filter((u) => u.gender === "female").length,
    allSignups: allSignupsInCohort,
  };
}


/** The cohort fields a Users doc needs for trial maths (pass to .select()). */
export const TRIAL_USER_FIELDS = [
  "started_trial", "converted_trial", "subscription_status", "progress",
  "subscription_cancelled_at", "revenue_usd_total", "proceeds_usd_total",
  "scalp_check_answers", "selected_gender", "email", "created_at",
  "scalp_check_readings", "scalp_tension_baseline",
] as const;

/** One Users doc with started_trial as a TrialUser. */
export function toTrialUser(d: DocumentData, createdMs: number, docGender: string | undefined): TrialUser {
  const progress = (d.progress as Record<string, Array<{ is_completed?: boolean }> | undefined> | undefined) ?? {};
  const perDay: boolean[] = [];
  const perDayOpened: boolean[] = [];
  let daysCompleted = 0, day1Done = 0, day1Total = 0;
  // Loop through MAX_TRACKED_DAY so we can also record Day 10 / 14
  // fully-complete status. daysCompleted still only counts trial
  // days (1..TRIAL_DAYS) because it drives the engagement gradient.
  for (let day = 1; day <= MAX_TRACKED_DAY; day++) {
    const entries = progress[`day${day}`];
    const opened = Array.isArray(entries) && entries.length > 0;
    const doneCount = opened ? entries!.filter((e) => e?.is_completed === true).length : 0;
    // "Day complete" = ALL tasks marked is_completed. Previously this
    // was `doneCount > 0` (any single task) which was misleading —
    // the panel's own label says "% that completed each day", so it
    // needs to mean fully complete.
    const totalCount = opened ? entries!.length : 0;
    const dayFullyDone = totalCount > 0 && doneCount === totalCount;
    perDay.push(dayFullyDone);
    perDayOpened.push(opened);
    if (dayFullyDone && day <= TRIAL_DAYS) daysCompleted++;
    if (day === 1) { day1Total = totalCount; day1Done = doneCount; }
  }

  const answers = (d.scalp_check_answers as Record<string, string> | undefined) ?? {};
  const baselineRaw = d.scalp_tension_baseline as unknown;
  const baselineNum =
    typeof baselineRaw === "number" ? baselineRaw
    : typeof baselineRaw === "string" ? Number.parseInt(baselineRaw, 10)
    : NaN;
  const baseline = Number.isFinite(baselineNum) && baselineNum >= 1 && baselineNum <= 5 ? baselineNum : null;
  const readings = new Map<number, number>();
  const rawReadings = Array.isArray(d.scalp_check_readings) ? (d.scalp_check_readings as unknown[]) : [];
  for (const entry of rawReadings) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as { day?: unknown; rating?: unknown };
    const day = Number(e.day);
    const rating = Number(e.rating);
    if (!Number.isFinite(day) || !Number.isFinite(rating)) continue;
    readings.set(day, rating); // retries: keep the latest
  }
  const hasLegacyAnswers = Object.keys(answers).length > 0;
  const inCheckInUniverse = baseline !== null || (rawReadings.length === 0 && hasLegacyAnswers);
  const checkInBucket = (day: 3 | 6): CheckInBucket | null => {
    if (!inCheckInUniverse) return null;
    if (rawReadings.length > 0 && baseline !== null) {
      const r = readings.get(day);
      if (r !== undefined) return r < baseline ? "looser" : r === baseline ? "same" : "tighter";
      // App skips Day 6 when Day 3 was already looser.
      const r3 = readings.get(3);
      if (day === 6 && r3 !== undefined && r3 < baseline) return "skipped_d3_looser";
    } else if (rawReadings.length === 0) {
      const a = answers[String(day)];
      if (a === "yes") return "legacy_yes";
      if (a === "no") return "legacy_no";
      if (a === "not_sure") return "legacy_not_sure";
    }
    if (perDay[day - 1]) return "finished_no_checkin";
    if (perDayOpened[day - 1]) return "opened_not_finished";
    return "never_opened";
  };

  const startedTrial = d.started_trial as { at?: unknown; product_id?: unknown } | undefined;

  return {
    createdMs,
    gender: docGender,
    startedAtMs: tsToMs(startedTrial?.at),
    daysCompleted,
    perDay,
    day1Done,
    day1Total,
    checkIn3: checkInBucket(3),
    checkIn6: checkInBucket(6),
    converted: !!d.converted_trial,
    cancelled: d.subscription_status === "cancelled",
    cancelledAtMs: tsToMs(d.subscription_cancelled_at),
    isAndroid: typeof startedTrial?.product_id === "string" && startedTrial.product_id.includes(":"),
    revenueUsd: typeof d.revenue_usd_total === "number" ? d.revenue_usd_total : 0,
    proceedsUsd: typeof d.proceeds_usd_total === "number" ? d.proceeds_usd_total : 0,
  };
}
