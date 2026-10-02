// Scalp check-in analytics (p20). Reads the v2 measured signal —
// scalp_tension_baseline (Day 0, int 1-5) + scalp_check_readings
// array [{day, rating, at}] — and NEVER blends with the legacy
// yes/no/not-sure scalp_check_answers. Different signal, different
// cohort.
//
// The load-bearing question this endpoint answers: does the measured
// pinch rating correlate with paid conversion? (thesis check)
//
// Cohort filter:
//   - user has scalp_tension_baseline set (went through Day 0 baseline)
//   - date filter on the baseline capture time (scalp_tension_baseline_at)
//   - optional tier filter (tier_1 / tier_2 / all). country_tier is
//     stored as "tier_1"/"tier_2"; legacy "tier1"/"tier2" also accepted
//     both as the query param and as the stored value.
//
// Definitions (kept in sync with /dashboard/trial):
//   - paid = converted_trial set (trial → paid renewal). converted_at,
//     pro and the paidStoppage tag are written when the TRIAL STARTS,
//     so they are NOT a paid signal.
//   - mature trial = started_trial.at more than 8 days ago (7-day trial
//     plus a day for the store renewal to land). Conversion is only
//     computed over mature trials so in-flight trials don't drag it down.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

const DEFAULT_FROM = "2026-09-02"; // p18 ship window
const CHECK_IN_DAYS = [3, 6, 13] as const;
const DAY_MS = 86_400_000;
const MATURE_MS = 8 * DAY_MS;

function normTier(raw: unknown): "tier_1" | "tier_2" | null {
  if (raw === "tier_1" || raw === "tier1") return "tier_1";
  if (raw === "tier_2" || raw === "tier2") return "tier_2";
  return null;
}

interface Reading {
  day: number;
  rating: number;
  at?: FirebaseFirestore.Timestamp;
}

interface UserRow {
  uid: string;
  baseline: number;
  baselineAtMs: number;
  tier: "tier_1" | "tier_2" | null;
  readings: Map<number, number>; // day → rating
  // progress.dayN fully completed (every entry is_completed: true). The
  // app only shows a check-in after all of that day's tasks are done.
  dayFull: Map<number, boolean>;
  stubbornScalp: boolean;
  onStopPlus: boolean;
  // started_trial.at > 8 days ago. Users without started_trial are
  // never mature (excluded from the thesis split).
  matureTrial: boolean;
  paid: boolean; // !!converted_trial
}

function ts(v: unknown): number | null {
  if (!v) return null;
  if (typeof v === "object" && v !== null && "toMillis" in v) {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === "string") {
    const d = new Date(v).getTime();
    return isNaN(d) ? null : d;
  }
  if (typeof v === "object" && v !== null) {
    const s = (v as { _seconds?: number; seconds?: number })._seconds ??
      (v as { seconds?: number }).seconds;
    if (typeof s === "number") return s * 1000;
  }
  return null;
}

export async function GET(req: Request) {
  try {
    const { db } = getFirebaseAdmin();
    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from") ?? DEFAULT_FROM;
    const toStr = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
    const tierParam = url.searchParams.get("tier") ?? "all"; // 'all' | 'tier_1' | 'tier_2' (legacy 'tier1' | 'tier2')
    const tierFilter = normTier(tierParam) ?? "all";
    const nowMs = Date.now();

    const fromMs = new Date(fromStr + "T00:00:00Z").getTime();
    const toMs = new Date(toStr + "T23:59:59Z").getTime();

    // Filter directly on scalp_tension_baseline_at instead of pulling
    // every FREE_STOPPAGE user (93k+ docs) and filtering in memory —
    // the wide scan was timing out at 500. Baseline capture is the
    // load-bearing signal for this page anyway; if it isn't set, we
    // have nothing to show. Auto-index handles single-field `>=`.
    const { Timestamp } = await import("firebase-admin/firestore");
    const snap = await db
      .collection("Users")
      .where("scalp_tension_baseline_at", ">=", Timestamp.fromMillis(fromMs))
      .where("scalp_tension_baseline_at", "<=", Timestamp.fromMillis(toMs))
      .get();

    const rows: UserRow[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
      // In-memory: FreeV2 stoppage cohort only.
      const stage = d.treatment_stage;
      if (stage !== "FREE_STOPPAGE" && stage !== "FREE_STOPPAGE_PLUS") continue;

      const baselineRaw = d.scalp_tension_baseline;
      const baseline =
        typeof baselineRaw === "number"
          ? baselineRaw
          : typeof baselineRaw === "string"
          ? Number.parseInt(baselineRaw, 10)
          : NaN;
      if (!Number.isFinite(baseline) || baseline < 1 || baseline > 5) continue;

      const baselineAtMs = ts(d.scalp_tension_baseline_at);
      if (baselineAtMs === null) continue;

      const tier = normTier(d.country_tier);
      if (tierFilter !== "all" && tier !== tierFilter) continue;

      const rawReadings = Array.isArray(d.scalp_check_readings)
        ? (d.scalp_check_readings as unknown[])
        : [];
      const readings = new Map<number, number>();
      for (const entry of rawReadings) {
        if (typeof entry !== "object" || entry === null) continue;
        const e = entry as { day?: unknown; rating?: unknown };
        const day = typeof e.day === "number" ? e.day : Number(e.day);
        const rating = typeof e.rating === "number" ? e.rating : Number(e.rating);
        if (!Number.isFinite(day) || !Number.isFinite(rating)) continue;
        // If multiple readings for the same day (retries), keep the latest
        readings.set(day, rating);
      }

      const progress = (d.progress ?? {}) as Record<string, unknown>;
      const dayFull = new Map<number, boolean>();
      for (const day of CHECK_IN_DAYS) {
        const entries = progress[`day${day}`];
        dayFull.set(
          day,
          Array.isArray(entries) &&
            entries.length > 0 &&
            entries.every(
              (e) => typeof e === "object" && e !== null && (e as { is_completed?: unknown }).is_completed === true,
            ),
        );
      }

      const startedTrial = d.started_trial as { at?: unknown } | undefined;
      const trialStartMs = startedTrial ? ts(startedTrial.at) : null;

      rows.push({
        uid: doc.id,
        baseline,
        baselineAtMs,
        tier,
        readings,
        dayFull,
        stubbornScalp: d.stubborn_scalp === true,
        onStopPlus: d.treatment_stage === "FREE_STOPPAGE_PLUS",
        matureTrial: trialStartMs !== null && trialStartMs < nowMs - MATURE_MS,
        paid: !!d.converted_trial,
      });
    }

    // ── 1. Rating movement per check-in day ─────────────────────
    // For each Day 3/6/13 count Looser (today<baseline), No change
    // (==), Tighter (>). Only counts users who actually completed the
    // check-in on that day.
    const movement: Record<
      number,
      { total: number; looser: number; noChange: number; tighter: number }
    > = {};
    for (const day of CHECK_IN_DAYS) {
      movement[day] = { total: 0, looser: 0, noChange: 0, tighter: 0 };
    }
    for (const r of rows) {
      for (const day of CHECK_IN_DAYS) {
        const today = r.readings.get(day);
        if (today === undefined) continue;
        movement[day].total++;
        if (today < r.baseline) movement[day].looser++;
        else if (today === r.baseline) movement[day].noChange++;
        else movement[day].tighter++;
      }
    }

    // ── 2. Headline: % loosening by Day 6 ───────────────────────
    // "By Day 6" = user had a looser reading on EITHER Day 3 OR Day 6.
    // Counts against everyone who had at least one reading by Day 6
    // (so we don't overstate against users who bailed early).
    let by6Eligible = 0;
    let by6Loosening = 0;
    for (const r of rows) {
      const d3 = r.readings.get(3);
      const d6 = r.readings.get(6);
      if (d3 === undefined && d6 === undefined) continue;
      by6Eligible++;
      if (
        (d3 !== undefined && d3 < r.baseline) ||
        (d6 !== undefined && d6 < r.baseline)
      ) {
        by6Loosening++;
      }
    }
    const looseningByD6Pct = by6Eligible === 0 ? 0 : (by6Loosening / by6Eligible) * 100;

    // ── 3. Avg rating trend ─────────────────────────────────────
    // Baseline (Day 0) + Day 3/6/13 averages across users with data.
    const avgFor = (day: number | 0): { avg: number; n: number } => {
      const values: number[] = [];
      for (const r of rows) {
        const v = day === 0 ? r.baseline : r.readings.get(day);
        if (typeof v === "number") values.push(v);
      }
      if (values.length === 0) return { avg: 0, n: 0 };
      return {
        avg: values.reduce((a, b) => a + b, 0) / values.length,
        n: values.length,
      };
    };
    const avgTrend = {
      day0: avgFor(0),
      day3: avgFor(3),
      day6: avgFor(6),
      day13: avgFor(13),
    };

    // ── 4. Thesis check — trial→paid split by rater cohort ──────
    // "Looser rater" = user showed looser reading on ANY of Day 3/6/13.
    // "No change rater" = user completed at least one check-in but was
    // never looser (equal or tighter throughout).
    // Compares paid conversion between the two groups. If loosening
    // detectors pay meaningfully more, the belief-instrument thesis
    // holds.
    // Paid = converted_trial; only MATURE trials (started > 8 days ago)
    // are counted so users still inside their trial don't read as
    // "didn't pay".
    let looserCohort = 0;
    let looserPaid = 0;
    let noChangeCohort = 0;
    let noChangePaid = 0;
    for (const r of rows) {
      if (!r.matureTrial) continue;
      let hasAnyReading = false;
      let hasLooser = false;
      for (const day of CHECK_IN_DAYS) {
        const t = r.readings.get(day);
        if (t === undefined) continue;
        hasAnyReading = true;
        if (t < r.baseline) hasLooser = true;
      }
      if (!hasAnyReading) continue;
      if (hasLooser) {
        looserCohort++;
        if (r.paid) looserPaid++;
      } else {
        noChangeCohort++;
        if (r.paid) noChangePaid++;
      }
    }
    const thesis = {
      looser: {
        cohort: looserCohort,
        paid: looserPaid,
        pct: looserCohort === 0 ? 0 : (looserPaid / looserCohort) * 100,
      },
      noChange: {
        cohort: noChangeCohort,
        paid: noChangePaid,
        pct:
          noChangeCohort === 0 ? 0 : (noChangePaid / noChangeCohort) * 100,
      },
    };

    // ── 5. Supporting metrics ───────────────────────────────────
    // Check-in completion = completed / ELIGIBLE, where eligible means
    // the app would actually have shown the check-in (matches
    // _maybeShowScalpCheckIn in the mobile app):
    //   - the user fully completed that day's tasks (progress.dayN all
    //     is_completed) — the modal only fires post-routine, and
    //   - Day 6: Day 3 reading was not looser than baseline
    //     Day 13: Day 6 reading was not looser than baseline
    //     (a missing earlier reading counts as "not looser", as in the app)
    // Secondary "share of cohort" = readings / users whose baseline is
    // at least N days old (the old, design-blind denominator).
    const wasLooser = (r: UserRow, day: number): boolean => {
      const v = r.readings.get(day);
      return v !== undefined && v < r.baseline;
    };
    const completion: Record<
      number,
      {
        eligible: number;
        completed: number;
        pct: number;
        cohortReached: number;
        cohortCompleted: number;
        cohortPct: number;
      }
    > = {};
    for (const day of CHECK_IN_DAYS) {
      let eligible = 0;
      let completed = 0;
      let cohortReached = 0;
      let cohortCompleted = 0;
      for (const r of rows) {
        const tenureDays = Math.floor((nowMs - r.baselineAtMs) / DAY_MS);
        if (tenureDays >= day) {
          cohortReached++;
          if (r.readings.has(day)) cohortCompleted++;
        }
        const gateOpen =
          day === 3 ? true : day === 6 ? !wasLooser(r, 3) : !wasLooser(r, 6);
        if (!gateOpen || !r.dayFull.get(day)) continue;
        eligible++;
        if (r.readings.has(day)) completed++;
      }
      completion[day] = {
        eligible,
        completed,
        pct: eligible === 0 ? 0 : (completed / eligible) * 100,
        cohortReached,
        cohortCompleted,
        cohortPct: cohortReached === 0 ? 0 : (cohortCompleted / cohortReached) * 100,
      };
    }

    const stubbornCount = rows.filter((r) => r.stubbornScalp).length;
    const stubbornPct =
      rows.length === 0 ? 0 : (stubbornCount / rows.length) * 100;

    // Day 13 no-change → on Stop+. Denominator = users who saw the
    // Day 13 no-change branch (Day 13 reading, today >= baseline).
    // Numerator = same users whose treatment_stage is FREE_STOPPAGE_PLUS.
    // The app writes no switch-source field (dashboard_screen.dart only
    // sets treatment_stage on the Start Stop+ tap), so a switch made any
    // other way (admin script, support) is indistinguishable — the card
    // is labelled "any source".
    let day13NoChange = 0;
    let day13StopPlusTaps = 0;
    for (const r of rows) {
      const d13 = r.readings.get(13);
      if (d13 === undefined) continue;
      if (d13 < r.baseline) continue; // looser branch — no CTA shown
      day13NoChange++;
      if (r.onStopPlus) day13StopPlusTaps++;
    }
    const stopPlusAcceptPct =
      day13NoChange === 0 ? 0 : (day13StopPlusTaps / day13NoChange) * 100;

    return NextResponse.json({
      ok: true,
      from: fromStr,
      to: toStr,
      tier: tierFilter,
      cohortSize: rows.length,
      movement,
      headline: {
        eligible: by6Eligible,
        loosening: by6Loosening,
        pct: looseningByD6Pct,
      },
      avgTrend,
      thesis,
      completion,
      stubborn: { count: stubbornCount, total: rows.length, pct: stubbornPct },
      stopPlus: {
        day13NoChange,
        accepted: day13StopPlusTaps,
        pct: stopPlusAcceptPct,
      },
    });
  } catch (e) {
    console.error("scalp-check-ins route error:", e);
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
