import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { founderCreators, programValue } from "@/lib/founder/creators";
import { cached } from "@/lib/founder/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/founder/creators?period=all|yyyy-mm: contract pay vs what each creator brought in.
// rows[].roi is null while the month is open (monthOpen); rows[].allTimeRoi is always set when known.
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = new URL(req.url).searchParams.get("period") ?? "";
    const n = new Date();
    const period = p === "all" || /^\d{4}-\d{2}$/.test(p) ? p : `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const load = (pd: string, f: boolean) =>
      cached(`creators_${pd}`, pd, async () => {
        const rows = await founderCreators(pd);
        return { period: pd, rows, program: await programValue(pd, rows) };
      }, { fresh: f });
    // A month still running has ROI that's always too high (a few days of
    // cost against money from last month's trials converting), so it's
    // hidden until the month ends. Every row carries all-time ROI instead.
    const thisMonth = `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
    const open = period === thisMonth;
    const [out, allOther] = await Promise.all([
      load(period, fresh),
      period === "all"
        ? null
        : load("all", false).catch((e) => {
            console.error("founder creators all-time ROI:", e);
            return null;
          }),
    ]);
    const all = period === "all" ? out : allOther;
    const allRoi = new Map((all?.rows ?? []).map((r) => [r.id, r.roi]));
    // Program-wide all-time return (brought in ÷ cost, every creator).
    const allIn = (all?.rows ?? []).reduce((a, r) => a + (r.broughtInUsd ?? 0), 0);
    const allCost = (all?.rows ?? []).reduce((a, r) => a + r.payCents, 0) / 100;
    return NextResponse.json({
      ...out,
      monthOpen: open,
      allTimeReturn: all && allCost > 0 ? allIn / allCost : null,
      rows: out.rows.map((r) => ({ ...r, roi: open ? null : r.roi, allTimeRoi: allRoi.get(r.id) ?? null })),
    });
  } catch (e) {
    console.error("founder creators failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
