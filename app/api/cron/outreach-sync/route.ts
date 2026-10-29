// Every 5 min: replies, calendar links and bounces from Gmail move creators in
// Recruit (lib/outreach-db.ts). The 15-minute outreach-replies cron does the
// sends; this one only keeps Recruit up to date.
import { NextResponse } from "next/server";
import { requireCronSecret } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { syncOutreachReplies } from "@/lib/outreach-db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const r = await syncOutreachReplies();
    await getFirebaseAdmin().db.collection("Settings").doc("outreach_daily").set({ last_sync_at: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ ok: true, checked: r.checked, replied: r.replied.length, invited: r.invited.length, bounced: r.bounced.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
