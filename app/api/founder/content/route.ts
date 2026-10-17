import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { founderContent } from "@/lib/founder/content";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/founder/content?month=yyyy-mm|all[&fresh=1][&week_of=yyyy-mm-dd]: the founder app's Content page
// (contract: views goal, period views + hits, this week's scripts, tests, creators, library, trending, facts).
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const q = new URL(req.url).searchParams;
    return NextResponse.json(await founderContent(q.get("month"), { fresh: q.get("fresh") === "1", week_of: q.get("week_of") ?? undefined }));
  } catch (e) {
    console.error("founder content failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
