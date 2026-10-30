import { NextRequest, NextResponse } from "next/server";
import { addBonusClaim, getHistory } from "@/lib/creators/db";
import { COUNTED_AUTOMATICALLY_NOTE } from "@/lib/creators/post-sync";
import { errorResponse, requireCreator, requireOnboarded } from "../_auth";

export const dynamic = "force-dynamic";

// GET: this creator's claims (newest first)
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const { bonusClaims } = await getHistory(creator.id);
    return NextResponse.json({
      // A manual claim closed as a duplicate of an auto one isn't shown twice.
      claims: bonusClaims.filter((c) => c.admin_note !== COUNTED_AUTOMATICALLY_NOTE).map((c) => ({
        id: c.id,
        video_url: c.video_url,
        platform: c.platform,
        posted_on: c.posted_on,
        views_claimed: c.views_claimed,
        status: c.status,
        admin_note: c.admin_note ?? null,
        claimed_at: c.claimed_at ?? null,
        has_screenshot: !!c.screenshot_path,
        crossed_100k_on: c.crossed_100k_on ?? null,
        crossed_1m_on: c.crossed_1m_on ?? null,
        source: c.source === "auto" ? "auto" : "manual",
      })),
    });
  } catch (e) {
    return errorResponse(e, "bonus list");
  }
}

// POST { video_url, platform, posted_on, views_claimed, screenshot_path? }
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    const b = await req.json();
    const claim = await addBonusClaim(creator.id, {
      video_url: String(b.video_url ?? ""),
      platform: b.platform,
      posted_on: String(b.posted_on ?? ""),
      views_claimed: Number(b.views_claimed),
      ...(b.screenshot_path ? { screenshot_path: String(b.screenshot_path) } : {}),
    });
    return NextResponse.json({ claim });
  } catch (e) {
    return errorResponse(e, "bonus claim");
  }
}
