import { NextRequest, NextResponse } from "next/server";
import { creatorToday, isYyyyMmDd } from "@/lib/creators/db";
import { detectedDays, getPostSyncState, listPosts } from "@/lib/creators/post-sync";
import { errorResponse, requireCreator } from "../_auth";

export const dynamic = "force-dynamic";

const MAX_RANGE_DAYS = 62;

// GET /api/creator/posts?from=yyyy-mm-dd&to=yyyy-mm-dd (both default to the
// creator's today; max 62 days). Session-scoped: the creator id comes from the
// cookie. Returns the posts the automatic sync found, per-day detection, and
// when the sync last succeeded.
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const today = creatorToday(creator);
    const q = req.nextUrl.searchParams;
    const from = isYyyyMmDd(q.get("from")) ? q.get("from")! : today;
    const to = isYyyyMmDd(q.get("to")) ? q.get("to")! : today;
    if (from > to) return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > MAX_RANGE_DAYS) {
      return NextResponse.json({ error: `Pick a range of ${MAX_RANGE_DAYS} days or less` }, { status: 400 });
    }
    const [all, sync] = await Promise.all([listPosts(creator.id, from, to), getPostSyncState(creator.id)]);
    // Only posts from the creator's current handles: after a handle change, the old
    // account's posts stay stored but don't show (or count) here.
    const norm = (h: unknown) => String(h ?? "").trim().replace(/^@/, "").toLowerCase();
    const current: Record<string, string> = { tiktok: norm(creator.tiktok_handle), instagram: norm(creator.instagram_handle) };
    const posts = all.filter((p) => {
      const want = current[p.platform];
      const h = norm(p.handle);
      return !want || !h || h === want;
    });
    return NextResponse.json({
      today,
      from,
      to,
      last_synced_at: sync?.last_ok_at ?? null,
      days: detectedDays(posts),
      posts: posts.map((p) => ({
        platform: p.platform,
        url: p.url,
        posted_at: p.posted_at,
        local_date: p.local_date,
        caption: p.caption,
        views: p.views,
        pinned: p.pinned,
        thumbnail_url: p.thumbnail_url,
      })),
    });
  } catch (e) {
    return errorResponse(e, "posts");
  }
}
