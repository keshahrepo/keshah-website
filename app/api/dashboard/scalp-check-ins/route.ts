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
//   - optional tier filter (tier1 / tier2 / all)

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

const DEFAULT_FROM = "2026-09-02"; // p18 ship window
const CHECK_IN_DAYS = [3, 6, 13] as const;

interface Reading {
  day: number;
  rating: number;
  at?: FirebaseFirestore.Timestamp;
}

interface UserRow {
  uid: string;
  baseline: number;
  baselineAtMs: number;
  tier: string | null; // 'tier1' | 'tier2' | null
  readings: Map<number, number>; // day → rating
  stubbornScalp: boolean;
  switchedToStopPlus: boolean;
  paid: boolean;
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
  return null;
}

export async function GET(req: Request) {
  try {
    const { db } = getFirebaseAdmin();
    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from") ?? DEFAULT_FROM;
    const toStr = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);
    const tierFilter = url.searchParams.get("tier") ?? "all"; // 'all' | 'tier1' | 'tier2'

    const fromMs = new Date(fromStr + "T00:00:00Z").getTime();
    const toMs = new Date(toStr + "T23:59:59Z").getTime();

    // Firestore doesn't let us filter on "field exists" cleanly, so
    // pull the Users with a treatment_stage set (FreeV2 stoppage cohort)
    // and filter in memory on scalp_tension_baseline presence.
    const snap = await db
      .collection("Users")
      .where("treatment_stage", "in", ["FREE_STOPPAGE", "FREE_STOPPAGE_PLUS"])
      .get();

    const rows: UserRow[] = [];
    for (const doc of snap.docs) {
      const d = doc.data() as Record<string, unknown>;
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
      if (baselineAtMs < fromMs || baselineAtMs > toMs) continue;

      const tier =
        typeof d.country_tier === "string"
          ? (d.country_tier as string)
          : null;
      if (tierFilter !== "all") {
        const wantTier = tierFilter === "tier1" ? "tier1" : "tier2";
        if (tier !== wantTier) continue;
      }

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

      rows.push({
        uid: doc.id,
        baseline,
        baselineAtMs,
        tier,
        readings,
        stubbornScalp: d.stubborn_scalp === true,
        switchedToStopPlus: d.treatment_stage === "FREE_STOPPAGE_PLUS",
        paid:
          d.converted_at != null ||
          d.pro === true ||
          (Array.isArray(d.extra_user_tags) &&
            (d.extra_user_tags as unknown[]).includes("paidStoppage")),
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
    let looserCohort = 0;
    let looserPaid = 0;
    let noChangeCohort = 0;
    let noChangePaid = 0;
    for (const r of rows) {
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
    // Check-in completion rate = users with a reading on Day N /
    // users who reached tenure ≥ N. Assumes tenure = today - baselineAt.
    const nowMs = Date.now();
    const completion: Record<number, { eligible: number; completed: number; pct: number }> = {};
    for (const day of CHECK_IN_DAYS) {
      let eligible = 0;
      let completed = 0;
      for (const r of rows) {
        const tenureDays = Math.floor((nowMs - r.baselineAtMs) / 86_400_000);
        if (tenureDays < day) continue;
        eligible++;
        if (r.readings.has(day)) completed++;
      }
      completion[day] = {
        eligible,
        completed,
        pct: eligible === 0 ? 0 : (completed / eligible) * 100,
      };
    }

    const stubbornCount = rows.filter((r) => r.stubbornScalp).length;
    const stubbornPct =
      rows.length === 0 ? 0 : (stubbornCount / rows.length) * 100;

    // Day 13 no-change → Stop+ tap rate. Denominator = users who saw
    // the Day 13 no-change branch (Day 13 reading, today >= baseline).
    // Numerator = same users whose treatment_stage flipped to
    // FREE_STOPPAGE_PLUS.
    let day13NoChange = 0;
    let day13StopPlusTaps = 0;
    for (const r of rows) {
      const d13 = r.readings.get(13);
      if (d13 === undefined) continue;
      if (d13 < r.baseline) continue; // looser branch — no CTA shown
      day13NoChange++;
      if (r.switchedToStopPlus) day13StopPlusTaps++;
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
