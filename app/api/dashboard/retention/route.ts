// Time-adjusted retention curve for paid users with date filter.
//
// "Paid" filter (Firestore-only, RC-validation cached out of band):
//   - has extra_user_tags containing "paidStoppage" (basic paid signal)
//   - has at least one progress.dayN entry with NON-EMPTY array
//     (this filters out the broken paidStoppage tag noise — only counts
//      users who actually engaged with the product at least once)
//
// Cohort timestamp (used for date filter + tenure):
//   - first_paid_at (preferred — immutable, set today's data foundation fix)
//   - paid_at (fallback — latest paid touch)
//   - created_at (last fallback)
//
// "Day N reached" = progress.dayN exists with NON-EMPTY array (i.e., user
// completed at least one exercise on that day). Empty arrays don't count
// — they're created when the day screen is opened but no exercise done.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

interface Milestone {
  day: number;
  eligible: number;
  reached: number;
  pct: number;
}

const DAY_MS = 86400000;
const DEFAULT_FROM = "2026-02-09"; // paid stoppage launch
const MILESTONE_DAYS = [1, 2, 3, 5, 7, 10, 14, 21, 30, 45, 60, 75, 90, 120];

export async function GET(req: Request) {
  try {
    const { db } = getFirebaseAdmin();
    const url = new URL(req.url);
    const fromStr = url.searchParams.get("from") ?? DEFAULT_FROM;
    const toStr = url.searchParams.get("to") ?? new Date().toISOString().slice(0, 10);

    const fromMs = new Date(fromStr + "T00:00:00Z").getTime();
    const toMs = new Date(toStr + "T23:59:59Z").getTime();
    const now = Date.now();

    const snap = await db.collection("Users")
      .where("extra_user_tags", "array-contains", "paidStoppage")
      .get();

    interface PaidUser {
      uid: string;
      cohortMs: number;
      tenureDays: number;
      maxDay: number;
      totalDays: number;
      store: string | null;
    }

    const paidUsers: PaidUser[] = [];
    let totalTagged = 0;
    let engagedCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.is_deleted) continue;
      totalTagged++;

      // Engagement check: a day is "completed" only if the user actually
      // finished at least one exercise that day (is_completed: true).
      // Just opening the day's screen pre-populates the array with
      // is_completed: false entries — we exclude those.
      const progress = (data.progress ?? {}) as Record<string, Array<Record<string, unknown>>>;
      const dayNumbers: number[] = [];
      for (const k of Object.keys(progress)) {
        if (!k.startsWith("day")) continue;
        const n = parseInt(k.slice(3), 10);
        if (!Number.isFinite(n)) continue;
        const entries = progress[k];
        if (!Array.isArray(entries) || entries.length === 0) continue;
        const hasCompleted = entries.some((e) => e?.is_completed === true);
        if (hasCompleted) dayNumbers.push(n);
      }
      if (dayNumbers.length === 0) continue; // not engaged — filter out
      engagedCount++;

      // Cohort timestamp
      const firstPaidMs = data.first_paid_at?.toDate?.()?.getTime?.() ?? null;
      const paidAtMs = data.paid_at?.toDate?.()?.getTime?.() ?? null;
      const createdAtMs = data.created_at?.toDate?.()?.getTime?.() ?? null;
      const cohortMs = firstPaidMs ?? paidAtMs ?? createdAtMs ?? null;
      if (!cohortMs) continue;

      // Date filter
      if (cohortMs < fromMs || cohortMs > toMs) continue;

      const tenureDays = Math.floor((now - cohortMs) / DAY_MS);
      const maxDay = Math.max(...dayNumbers);

      // Try to infer store from payment_provider field (rough)
      let store: string | null = null;
      if (data.razorpay_subscription_id) store = "razorpay_web";
      else if (data.payment_provider === "rc_billing") store = "rc_billing_web";
      else if (data.stripe_customer_id) store = "stripe_web";
      // Native iOS/Android subscribers don't have these fields set;
      // they're identified by being engaged paid users without web payment evidence.

      paidUsers.push({
        uid: doc.id,
        cohortMs,
        tenureDays,
        maxDay,
        totalDays: dayNumbers.length,
        store,
      });
    }

    // Compute time-adjusted retention curve
    const milestones: Milestone[] = MILESTONE_DAYS.map((d) => {
      const eligible = paidUsers.filter((u) => u.tenureDays >= d).length;
      const reached = paidUsers.filter((u) => u.tenureDays >= d && u.maxDay >= d).length;
      return {
        day: d,
        eligible,
        reached,
        pct: eligible > 0 ? Math.round((reached / eligible) * 1000) / 10 : 0,
      };
    });

    return NextResponse.json({
      ok: true,
      from: fromStr,
      to: toStr,
      cohort_size: paidUsers.length,
      total_tagged: totalTagged,
      engaged: engagedCount,
      milestones,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
