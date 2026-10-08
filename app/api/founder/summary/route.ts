import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { founderSummary } from "@/lib/founder/summary";
import { cached } from "@/lib/founder/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// GET /api/founder/summary?period=all|yyyy-mm: the founder Home numbers.
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = new URL(req.url).searchParams.get("period") ?? "";
    const n = new Date();
    const period = p === "all" || /^\d{4}-\d{2}$/.test(p) ? p : `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    return NextResponse.json(await cached(`summary_${period}`, period, () => founderSummary(period, { fresh }), { fresh }));
  } catch (e) {
    console.error("founder summary failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
