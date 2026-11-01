import { NextRequest, NextResponse } from "next/server";
import { getDailyPicks, swapPick, type PicksPayload } from "@/lib/creators/proven-db";
import { appBuild, linesForBuild } from "@/lib/creators/script-core";
import { errorResponse, requireCreator, requireOnboarded } from "../_auth";

export const dynamic = "force-dynamic";

/** Apps before the 🎭 build get acting notes inside the ✋ line. */
function forApp(req: NextRequest, p: PicksPayload): PicksPayload {
  const build = appBuild(req.headers.get("x-app-version"));
  return { ...p, picks: p.picks.map((x) => (x.video.lines ? { ...x, video: { ...x.video, lines: linesForBuild(x.video.lines, build) } } : x)) };
}

// GET: today's proven videos to remake (stable for the creator's local day).
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    return NextResponse.json(forApp(req, await getDailyPicks(creator)));
  } catch (e) {
    return errorResponse(e, "picks");
  }
}

// POST { slot }: swap that pick for another active video.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    const b = (await req.json().catch(() => ({}))) as { slot?: unknown };
    return NextResponse.json(forApp(req, await swapPick(creator, Number(b.slot))));
  } catch (e) {
    return errorResponse(e, "picks swap");
  }
}
