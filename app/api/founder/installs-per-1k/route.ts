// GET /api/founder/installs-per-1k?period=yyyy-mm|all: link installs per 1,000 views,
// overall (Aadi + creators) and per account, plus week by week. Views are views
// gained on the same days as the installs (lib/founder/installs-per-1k.ts),
// tracked since VIEWS_TRACKED_FROM; refreshed hourly with the installs chart.
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { byWeek, per1k, PER_1K_DOC, sumDays, VIEWS_TRACKED_FROM, windowFor, type AccountDays } from "@/lib/founder/installs-per-1k";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const period = new URL(req.url).searchParams.get("period") ?? "all";
  const d = (await getFirebaseAdmin().db.collection("Stats").doc(PER_1K_DOC).get()).data() ?? {};
  const accounts = ((d.accounts as AccountDays[] | undefined) ?? []);
  const w = windowFor(period);
  const base = { period, tracked_from: VIEWS_TRACKED_FROM, updated_at: d.updated_at ?? null, error: d.error ?? null };
  if (!w) return NextResponse.json({ ...base, from: null, to: null, overall: per1k(0, 0), accounts: [], weeks: [] });
  const rows = accounts
    .map((a) => ({ id: a.id, name: a.name, isAadi: a.isAadi, noTag: a.noTag, ...sumDays(a, w.from, w.to), weeks: byWeek([a], w.from, w.to) }))
    .filter((r) => r.views > 0 || r.installs > 0)
    .sort((a, b) => b.views - a.views);
  const tagged = rows.filter((r) => !r.noTag);
  const overall = per1k(tagged.reduce((s, r) => s + r.views, 0), tagged.reduce((s, r) => s + r.installs, 0));
  return NextResponse.json({ ...base, from: w.from, to: w.to, overall, accounts: rows, weeks: byWeek(accounts.filter((a) => !a.noTag), w.from, w.to) });
}
