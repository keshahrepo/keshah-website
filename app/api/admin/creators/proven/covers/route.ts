// Backfill: copy the cover image of every active proven video that lacks one
// into Firebase Storage (lib/creators/proven-media.ts).
//   GET|POST ?dry=1     count only (what would be mirrored, worst-case credits)
//   GET|POST ?limit=N   at most N videos this call (default/max MEDIA_BACKFILL_CAP)
//   GET|POST ?small=1   instead: make the ~360px list cover (media.thumb_small_url)
//                       for covers already mirrored without one (no credits; ?dry=1 works too)
// Stops starting new videos near the 300s limit; re-run while `remaining` > 0.
// Auth: admin dashboard cookie, or Authorization: Bearer ${CRON_SECRET}.
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { requireCronSecret } from "@/lib/support/auth";
import { MEDIA_BACKFILL_CAP, SMALL_COVER_CAP, makeSmallCovers, mirrorProvenCovers } from "@/lib/creators/proven-media";

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
  const limit = Number.isInteger(n) && n > 0 ? Math.min(n, MEDIA_BACKFILL_CAP) : MEDIA_BACKFILL_CAP;
  try {
    if (q.get("small") === "1" || q.get("small") === "true") {
      const r = await makeSmallCovers({ limit: Math.min(limit, SMALL_COVER_CAP), dry, deadlineMs: Date.now() + 270_000 });
      return NextResponse.json({ ok: true, mode: "small", ...r });
    }
    const r = await mirrorProvenCovers({ limit, dry, deadlineMs: Date.now() + 270_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error("proven covers backfill error:", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
