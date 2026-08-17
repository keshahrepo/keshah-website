// Trial → paid conversion stats for /startindiafree2 (premium ₹999/mo trial).
// Filters by razorpay_plan == "monthlyPremium" (only this funnel uses it)
// and aggregates by trial_status.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export async function GET() {
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db
      .collection("Users")
      .where("razorpay_plan", "==", "monthlyPremium")
      .get();

    let total = 0;
    let active = 0;
    let converted = 0;
    let cancelled = 0;
    const recent: Array<{ uid: string; status: string; paid_at: string | null; trial_started_at: string | null }> = [];

    for (const doc of snap.docs) {
      const x = doc.data();
      const status = x.trial_status as string | undefined;
      if (!status) continue;

      total++;
      if (status === "active") active++;
      else if (status === "converted") converted++;
      else if (status === "cancelled") cancelled++;

      recent.push({
        uid: doc.id,
        status,
        paid_at: x.paid_at?.toDate?.()?.toISOString?.() ?? null,
        trial_started_at: x.trial_started_at?.toDate?.()?.toISOString?.() ?? null,
      });
    }

    // Sort by trial_started_at desc, take last 20 for visibility
    recent.sort((a, b) => (b.trial_started_at ?? "").localeCompare(a.trial_started_at ?? ""));

    const conversionRate = total > 0 ? (converted / total) * 100 : 0;
    const cancelRate = total > 0 ? (cancelled / total) * 100 : 0;

    return NextResponse.json({
      ok: true,
      total,
      active,
      converted,
      cancelled,
      conversionRate: Number(conversionRate.toFixed(1)),
      cancelRate: Number(cancelRate.toFixed(1)),
      recent: recent.slice(0, 20),
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "unknown";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
