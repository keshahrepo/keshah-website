import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { appMetrics } from "@/lib/founder/app-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/founder/app?release=<slug>: trial cohort + onboarding funnel for a release and the one before.
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const slug = new URL(req.url).searchParams.get("release") ?? undefined;
    return NextResponse.json(await appMetrics(slug));
  } catch (e) {
    console.error("founder app metrics failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
