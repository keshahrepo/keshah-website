import { NextRequest, NextResponse } from "next/server";
import { pinnedUploadSession, pinnedUploadUrl, startPinned, submitPinned } from "@/lib/creators/pinned-video";
import { errorResponse, requireCreator, requireNotEnded } from "../_auth";

export const dynamic = "force-dynamic";

// POST { action: "upload_session", content_type } -> { session_uri, path } (PUT it in pieces with Content-Range)
// POST { action: "upload_url", content_type }  -> { upload_url, path } (one PUT; build 7 and earlier)
// POST { action: "submit", path }              -> { pinned_video }   (sends it for review; the first one counts the day)
// POST { action: "start" }                     -> { pinned_video }   (new creators, no upload: counts once it's pinned on both apps)
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const ended = requireNotEnded(creator);
  if (ended) return ended;
  try {
    const body = (await req.json().catch(() => ({}))) as { action?: string; content_type?: string; path?: string };
    if (body.action === "upload_session") return NextResponse.json(await pinnedUploadSession(creator.id, String(body.content_type ?? "")));
    if (body.action === "upload_url") return NextResponse.json(await pinnedUploadUrl(creator.id, String(body.content_type ?? "")));
    if (body.action === "start") return NextResponse.json({ pinned_video: await startPinned(creator.id) });
    if (body.action === "submit") return NextResponse.json({ pinned_video: await submitPinned(creator.id, String(body.path ?? "")) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return errorResponse(e, "pinned video");
  }
}
