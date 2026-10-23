import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { founderCreatorsWithAccount, programOver100k, programTopVideos, programValue } from "@/lib/founder/creators";
import { cached } from "@/lib/founder/cache";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// GET /api/founder/creators?period=all|yyyy-mm: each creator's cost (contract pay) vs proceeds from their link.
// rows[].roi follows the period (the open month's is "so far": proceeds ÷ whole-month committed cost).
// monthOpen, rows[].allTimeRoi and allTimeReturn are kept for older app builds.
// topVideos: the program's 5 most-viewed videos posted in the period (rows[].topVideos: each creator's).
// over100k: posts from the period at 100K+ views, one per post/platform, newest first, capped at 50,
// with creatorId/creatorName; over100kCount is the exact total (rows[].over100k / over100kCount: each creator's).
// founderAccount: the founder's own account (Aadi's), same shape as a row but unpaid, never in rows or totals.
export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const p = new URL(req.url).searchParams.get("period") ?? "";
    const n = new Date();
    const period = p === "all" || /^\d{4}-\d{2}$/.test(p) ? p : `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}`;
    const fresh = new URL(req.url).searchParams.get("fresh") === "1";
    const load = (pd: string, f: boolean) =>
      cached(`creators_${pd}`, pd, async () => {
        const { rows, founderAccount } = await founderCreatorsWithAccount(pd);
        return { period: pd, rows, founderAccount, program: await programValue(pd, rows) };
      }, { fresh: f });
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
    // Program-wide all-time ROI (proceeds ÷ cost, every creator). Field keeps its old name.
    const allIn = (all?.rows ?? []).reduce((a, r) => a + (r.broughtInUsd ?? 0), 0);
    const allCost = (all?.rows ?? []).reduce((a, r) => a + (r.committedCents ?? r.payCents), 0) / 100;
    const big = programOver100k(out.rows);
    return NextResponse.json({
      ...out,
      monthOpen: open,
      topVideos: programTopVideos(out.rows),
      over100k: big.list,
      over100kCount: big.count,
      allTimeReturn: all && allCost > 0 ? allIn / allCost : null,
      rows: out.rows.map((r) => ({ ...r, topVideos: r.topVideos ?? [], over100k: r.over100k ?? [], over100kCount: r.over100kCount ?? 0, allTimeRoi: allRoi.get(r.id) ?? null })),
    });
  } catch (e) {
    console.error("founder creators failed:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
