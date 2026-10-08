import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { founderCreators, programValue } from "@/lib/founder/creators";
import { cached } from "@/lib/founder/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/founder/creators?period=all|yyyy-mm: contract pay vs what each creator brought in.
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = new URL(req.url).searchParams.get("period") ?? "";
    const n = new Date();
    const period = p === "all" || /^\d{4}-\d{2}$/.test(p) ? p : `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    return NextResponse.json(
      await cached(`creators_${period}`, period, async () => {
        const rows = await founderCreators(period);
        return { period, rows, program: await programValue(period, rows) };
      }, { fresh }),
    );
  } catch (e) {
    console.error("founder creators failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
