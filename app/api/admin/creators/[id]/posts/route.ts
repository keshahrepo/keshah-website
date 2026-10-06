import { NextRequest, NextResponse } from "next/server";
import { getCreator, isMonth, requireAdmin, todayIn } from "@/lib/creators/admin";
import { detectedDays, getPostSyncState, listPosts, syncCreatorPosts } from "@/lib/creators/post-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

function monthLast(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// GET /api/admin/creators/:id/posts?month=yyyy-mm[&history=1]
// Every tracked post whose creator-local posting date is in the month (newest
// first, with latest views), per-day detection, and sync health.
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const creator = await getCreator(id);
  if (!creator) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const q = req.nextUrl.searchParams;
  const qMonth = q.get("month");
  const month = isMonth(qMonth) ? qMonth : todayIn(creator.timezone).slice(0, 7);
  const [posts, post_sync] = await Promise.all([
    listPosts(id, `${month}-01`, monthLast(month), { withHistory: q.get("history") === "1" }),
    getPostSyncState(id),
  ]);
  const days = detectedDays(posts);
  return NextResponse.json({
    month,
    timezone: creator.timezone,
    handles: { tiktok: creator.tiktok_handle ?? "", instagram: creator.instagram_handle ?? "" },
    post_sync,
    totals: {
      posts: posts.length,
      views: posts.reduce((s, p) => s + p.views, 0),
      posted_days: days.filter((d) => d.posted).length,
    },
    days,
    posts,
  });
}

// POST /api/admin/creators/:id/posts — "Sync now" for one creator (1-6 ScrapeCreators credits).
export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  if (!process.env.SCRAPECREATORS_API_KEY) {
    return NextResponse.json({ error: "SCRAPECREATORS_API_KEY not set" }, { status: 500 });
  }
  try {
    const result = await syncCreatorPosts(id);
    return NextResponse.json({ result, post_sync: await getPostSyncState(id) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: msg === "Creator not found" ? 404 : 500 });
  }
}
