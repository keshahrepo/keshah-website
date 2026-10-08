import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { appMetrics } from "@/lib/founder/app-metrics";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/founder/app?release=<slug>: trial cohort + onboarding funnel for a release and the one before.
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const q = new URL(req.url).searchParams;
    const slug = q.get("release") ?? undefined;
    // A release is thousands of user docs: cache the result for 15 minutes.
    const ref = getFirebaseAdmin().db.collection("DashboardMetrics").doc(`founder_app_${slug ?? "default"}`);
    if (q.get("fresh") !== "1") {
      const snap = await ref.get();
      const at = snap.exists ? Date.parse(String(snap.get("computed_at") ?? "")) : NaN;
      if (Number.isFinite(at) && Date.now() - at < 15 * 60_000) return NextResponse.json({ ...JSON.parse(String(snap.get("json"))), computed_at: snap.get("computed_at") });
    }
    const out = await appMetrics(slug);
    const computed_at = new Date().toISOString();
    await ref.set({ json: JSON.stringify(out), computed_at }).catch((e) => console.error("founder app cache write failed:", e));
    return NextResponse.json({ ...out, computed_at });
  } catch (e) {
    console.error("founder app metrics failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
