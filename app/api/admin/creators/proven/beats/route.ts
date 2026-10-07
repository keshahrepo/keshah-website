// Backfill: write talking points ("beats") for every active proven video that
// has a transcript but none yet (lib/creators/proven-beats.ts).
//   GET|POST ?dry=1     count only (what would be generated)
//   GET|POST ?limit=N   at most N videos this call (default/max BEATS_BACKFILL_CAP)
// Stops starting new videos near the 300s limit; re-run while `remaining` > 0.
// Never touches videos that already have talking points (admin edits stay).
// Auth: admin dashboard cookie, or Authorization: Bearer ${CRON_SECRET}.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { requireCronSecret } from "@/lib/support/auth";
import { BEATS_BACKFILL_CAP, generateProvenBeats } from "@/lib/creators/proven-beats";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function handle(req: NextRequest) {
  if (!requireCronSecret(req)) {
    const denied = await requireAdmin(req);
    if (denied) return denied;
  }
  const q = req.nextUrl.searchParams;
  const dry = q.get("dry") === "1" || q.get("dry") === "true";
  const n = Number(q.get("limit"));
  const limit = Number.isInteger(n) && n > 0 ? Math.min(n, BEATS_BACKFILL_CAP) : BEATS_BACKFILL_CAP;
  try {
    const r = await generateProvenBeats({ limit, dry, deadlineMs: Date.now() + 180_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("proven beats backfill error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
