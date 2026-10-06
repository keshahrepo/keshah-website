import { NextRequest, NextResponse } from "next/server";
import { creatorToday, savePostingDay } from "@/lib/creators/db";
import { completeVideoCount } from "@/lib/creators/pay";
import type { PostedVideo } from "@/lib/creators/types";
import { errorResponse, requireCreator } from "../_auth";

// POST { videos: [{ tiktok_url, instagram_url }], date? } — date defaults to
// the creator's today; savePostingDay rejects anything past 11:59 pm their time.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  try {
    const body = await req.json();
    const date = typeof body.date === "string" ? body.date : creatorToday(creator);
    const saved = await savePostingDay(creator.id, date, (body.videos ?? []) as PostedVideo[]);
    return NextResponse.json({ log: saved, complete_videos: completeVideoCount(saved) });
  } catch (e) {
    return errorResponse(e, "posting");
  }
}
