// Cron, hourly (vercel.json): the weekly niche scan (lib/creators/niche-scan.ts).
// Runs Mondays from 13:00 UTC, or within the hour when
// Settings/creator_portal.niche_scan_requested is true. Otherwise one Firestore read.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { nicheScanDue, runNicheScan } from "@/lib/creators/niche-scan";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { db } = getFirebaseAdmin();
    const s = (await db.collection("Settings").doc("creator_portal").get()).data() ?? {};
    const due = nicheScanDue({ now: new Date(), requested: s.niche_scan_requested === true, last: typeof s.niche_scan_last === "string" ? s.niche_scan_last : null });
    if (!due) return NextResponse.json({ ok: true, skipped: true });
    const r = await runNicheScan(db, { deadlineMs: Date.now() + 250_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("niche scan cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
