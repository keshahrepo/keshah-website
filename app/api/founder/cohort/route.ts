import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { cohort, cohortKey, parseCohortQuery } from "@/lib/founder/app-cohort";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/founder/cohort?period=all|yyyy-mm&release=all|slug&g=&s=&c=&camp=[&fresh=1]
// One cohort of KESHAH app signups for the founder app. Cached (15 min while
// the window is still open, 6 h once it's closed).
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(req.url).searchParams;
    const q = parseCohortQuery(params);
    const ref = getFirebaseAdmin().db.collection("DashboardMetrics").doc(`founder_cohort_${cohortKey(q)}`.slice(0, 1400));
    if (params.get("fresh") !== "1") {
      const snap = await ref.get();
      if (snap.exists) {
        const at = Date.parse(String(snap.get("computed_at") ?? ""));
        const closed = snap.get("closed") === true;
        if (Number.isFinite(at) && Date.now() - at < (closed ? 6 * 3600_000 : 15 * 60_000)) {
          return NextResponse.json({ ...JSON.parse(String(snap.get("json"))), computed_at: snap.get("computed_at") });
        }
      }
    }
    const out = await cohort(q);
    const computed_at = new Date().toISOString();
    const closed = !!out.to && Date.parse(out.to) < Date.now() - 9 * 86_400_000;
    await ref.set({ json: JSON.stringify(out), computed_at, closed }).catch((e) => console.error("cohort cache write failed:", e));
    return NextResponse.json({ ...out, computed_at });
  } catch (e) {
    console.error("founder cohort failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
