import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/creators/admin";
import { CreatorDataError, getCreator } from "@/lib/creators/db";
import { notify } from "@/lib/push";
import { hasPinnedPost, pinnedForReview, requestPinned, reviewPinned } from "@/lib/creators/pinned-video";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET: their pinned video to review (video_url signed for an hour) and whether it's pinned yet.
// POST { action: "approve" | "changes", note? }
export async function GET(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const [pinned, live] = await Promise.all([pinnedForReview(id), hasPinnedPost(id)]);
  return NextResponse.json({ pinned_video: pinned, pinned_live: live }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { action?: string; note?: string; when?: string };
  // Ask an existing creator for one: today or their next weekday is a pinned video day.
  if (body.action === "request") {
    try {
      const when = (body as { when?: string }).when === "today" ? "today" : "next";
      return NextResponse.json({ pinned_video: await requestPinned(id, when) });
    } catch (e) {
      if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
  }
  // A reminder for a creator who hasn't sent it yet.
  if (body.action === "nudge") {
    const c = await getCreator(id);
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await notify({ creatorId: id, email: c.email || null }, { title: "Your pinned video", body: "Make your pinned video today. Your daily videos start once it's in.", data: { type: "pinned_nudge" } });
    return NextResponse.json({ ok: true });
  }
  if (body.action !== "approve" && body.action !== "changes") return NextResponse.json({ error: "action must be approve or changes" }, { status: 400 });
  try {
    return NextResponse.json({ pinned_video: await reviewPinned(id, body.action, String(body.note ?? "")) });
  } catch (e) {
    if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("pinned review failed:", e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
