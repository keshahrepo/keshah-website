import { NextRequest, NextResponse } from "next/server";
import { firestoreCheckDeps, parseCheckInput, runPostCheck } from "@/lib/creators/post-check";
import { errorResponse, requireCreator, requireOnboarded } from "../../_auth";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { slot?: 0-4, proven_id? } (cookie or app Bearer). "I posted it": runs
// the shallow post sync for this creator only (rate limited to one per 30s,
// 429 + retry_after_s), attributes today's newest unclaimed TikTok + Reel to
// the slot, and returns today's counts, what was found for the slot, today's
// detected posts, and day_complete when this check made the day count (once
// per day, shared with POST /api/creator/posting). See lib/creators/post-check.ts.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    const input = parseCheckInput(await req.json().catch(() => ({})));
    if ("error" in input) return NextResponse.json({ error: input.error }, { status: 400 });
    const r = await runPostCheck(creator, input, firestoreCheckDeps());
    if (r.status === 429) {
      return NextResponse.json(
        { error: `We just checked. Try again in ${r.retry_after_s} seconds.`, retry_after_s: r.retry_after_s },
        { status: 429, headers: { "Retry-After": String(r.retry_after_s) } },
      );
    }
    if (r.status === 400) return NextResponse.json({ error: r.error }, { status: 400 });
    return NextResponse.json(r.body);
  } catch (e) {
    return errorResponse(e, "posts check");
  }
}
