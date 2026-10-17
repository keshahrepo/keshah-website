// Cron, every 10 minutes (vercel.json; one Firestore read when idle, so a long scan resumes quickly): the weekly niche scan (lib/creators/niche-scan.ts).
// Starts Saturdays from 20:00 UTC (Sunday as a catch-up), or within 10 minutes
// when Settings/creator_portal.niche_scan_requested is true. A scan that runs
// past one call's deadline is left in Settings/creator_portal.niche_scan_active
// and resumed by the next call. Otherwise one Firestore read.
// Also the weekly content schedule (lib/creators/content-schedule.ts): drafts
// the coming Monday's scripts after Saturday's scan (or 23:30 UTC), the Sunday
// 00:30 UTC founder push, and Settings/creator_portal.content_draft_requested.
// A draft call skips the scan chunk (both are slow); the scan resumes next call.
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { nicheScanDue, runNicheScanChunk } from "@/lib/creators/niche-scan";
import { contentDue, runContentAction } from "@/lib/creators/content-schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  if (!requireCronSecret(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { db } = getFirebaseAdmin();
    const s = (await db.collection("Settings").doc("creator_portal").get()).data() ?? {};
    const now = new Date();
    const content = contentDue(now, s);
    let contentResult: Record<string, unknown> | null = null;
    if (content) {
      try {
        contentResult = await runContentAction(db, content, s, now);
      } catch (e) {
        console.error("content schedule error:", e);
        contentResult = { content: "failed", error: e instanceof Error ? e.message : String(e) };
      }
      if (content.kind === "draft") return NextResponse.json({ ok: true, ...contentResult });
    }
    const active = typeof s.niche_scan_active === "string";
    const due = nicheScanDue({ now, requested: s.niche_scan_requested === true, last: typeof s.niche_scan_last === "string" ? s.niche_scan_last : null });
    if (!active && !due) return NextResponse.json({ ok: true, skipped: true, ...(contentResult ?? {}) });
    const r = await runNicheScanChunk(db, { settings: s, deadlineMs: Date.now() + 230_000 });
    return NextResponse.json({ ok: true, ...r, ...(contentResult ?? {}) });
  } catch (e) {
    console.error("niche scan cron error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
