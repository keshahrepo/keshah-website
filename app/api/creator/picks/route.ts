import { NextRequest, NextResponse } from "next/server";
import { getDailyPicks, swapPick } from "@/lib/creators/proven-db";
import { errorResponse, requireCreator, requireOnboarded } from "../_auth";

export const dynamic = "force-dynamic";

// GET: today's proven videos to remake (stable for the creator's local day).
export async function GET(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    return NextResponse.json(await getDailyPicks(creator));
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
    return NextResponse.json(await swapPick(creator, Number(b.slot)));
  } catch (e) {
    return errorResponse(e, "picks swap");
  }
}
