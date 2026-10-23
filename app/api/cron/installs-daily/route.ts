// Cron, hourly (vercel.json): installs by day (Aadi / creators / organic) and views, for the founder chart.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { backfillAadiInstalls, refreshInstallsDaily } from "@/lib/founder/installs-daily";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await refreshInstallsDaily();
    // One-off look back when Settings/creator_portal.installs_backfill_from is set (then cleared).
    const ref = getFirebaseAdmin().db.collection("Settings").doc("creator_portal");
    const from = (await ref.get()).data()?.installs_backfill_from;
    const back = typeof from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(from) ? await backfillAadiInstalls(from) : null;
    if (back) await ref.set({ installs_backfill_from: null }, { merge: true });
    return NextResponse.json({ ok: true, ...r, ...(back ? { backfill: back } : {}) });
  } catch (e) {
    console.error("installs daily cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
