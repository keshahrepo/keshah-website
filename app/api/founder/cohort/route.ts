import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { cachedCohort, parseCohortQuery } from "@/lib/founder/app-cohort";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/founder/cohort?period=all|yyyy-mm&release=all|slug&g=&s=&c=&camp=[&fresh=1]
// One cohort of KESHAH app signups for the founder app (cached, see cachedCohort).
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const params = new URL(req.url).searchParams;
    return NextResponse.json(await cachedCohort(parseCohortQuery(params), { fresh: params.get("fresh") === "1" }));
  } catch (e) {
    console.error("founder cohort failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
