// GET: every creator the founder made a prediction for, next to what happened
// (trial result, trial days posted, views, breakout videos) and the signals we had
// before (research notes fit, followers), plus the hit rate per confidence level.
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { CREATORS_COLLECTION, getHistory } from "@/lib/creators/db";
import { trialWindow } from "@/lib/creators/pay";
import { calibration, trialResult } from "@/lib/founder/predictions";
import type { CreatorProfile } from "@/lib/creators/types";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BREAKOUT = 30_000;

export async function GET() {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = getFirebaseAdmin().db;
  const snap = await db.collection(CREATORS_COLLECTION).get();
  const docs = snap.docs.filter((d) => d.get("hire_prediction"));
  const rows = await Promise.all(
    docs.map(async (d) => {
      const x = d.data();
      const result = trialResult(x);
      const [hist, posts, app] = await Promise.all([
        getHistory(d.id).catch(() => null),
        d.ref.collection("posts").get().catch(() => null),
        x.application_id ? db.collection("careers_applications").doc(String(x.application_id)).get().catch(() => null) : Promise.resolve(null),
      ]);
      const tw = hist ? trialWindow(x as unknown as CreatorProfile, hist.postingDays) : null;
      const views = (posts?.docs ?? []).filter((p) => !p.get("pinned")).map((p) => Number(p.get("views") ?? 0));
      return {
        id: d.id,
        name: String(x.name ?? x.legal_name ?? ""),
        pct: Number(x.hire_prediction.pct),
        why: x.hire_prediction.why ?? null,
        predicted_at: x.hire_prediction.at ?? null,
        start_date: x.start_date ?? null,
        result,
        trial_days: tw ? tw.days.length : 0,
        views: views.reduce((s, v) => s + v, 0),
        breakouts: views.filter((v) => v >= BREAKOUT).length,
        fit: app?.get("research_notes")?.fit ?? null,
        followers: typeof app?.get("followers") === "number" ? app.get("followers") : null,
      };
    }),
  );
  rows.sort((a, b) => String(b.predicted_at).localeCompare(String(a.predicted_at)));
  return NextResponse.json({ rows, calibration: calibration(rows), breakout_views: BREAKOUT });
}
