import { NextRequest, NextResponse } from "next/server";
import { pinnedUploadUrl, submitPinned } from "@/lib/creators/pinned-video";
import { errorResponse, requireCreator, requireNotEnded } from "../_auth";

export const dynamic = "force-dynamic";

// POST { action: "upload_url", content_type }  -> { upload_url, path } (PUT the file there)
// POST { action: "submit", path }              -> { pinned_video }   (sends it for review; the first one counts the day)
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const ended = requireNotEnded(creator);
  if (ended) return ended;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; content_type?: string; path?: string };
    if (body.action === "upload_url") return NextResponse.json(await pinnedUploadUrl(creator.id, String(body.content_type ?? "")));
    if (body.action === "submit") return NextResponse.json({ pinned_video: await submitPinned(creator.id, String(body.path ?? "")) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return errorResponse(e, "pinned video");
  }
}
