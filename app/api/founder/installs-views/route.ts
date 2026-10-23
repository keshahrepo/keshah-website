// GET /api/founder/installs-views?days=30: installs by day (Aadi's account, creators' links, organic)
// and views from that day's posts, refreshed hourly (lib/founder/installs-daily.ts).
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { STATS_DOC, type InstallsDay } from "@/lib/founder/installs-daily";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await requireDashboardSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const n = Math.min(45, Math.max(7, Number(new URL(req.url).searchParams.get("days") ?? 30) || 30));
  const d = (await getFirebaseAdmin().db.collection("Stats").doc(STATS_DOC).get()).data() ?? {};
  const days = ((d.days as InstallsDay[] | undefined) ?? []).slice(-n);
  return NextResponse.json({ days, updated_at: d.updated_at ?? null, error: d.error ?? null });
}
