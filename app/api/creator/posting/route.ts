import { NextRequest, NextResponse } from "next/server";
import { creatorToday, getCreator, getHistory, hasStarted, savePostingDay } from "@/lib/creators/db";
import { completeVideoCount, dayComplete, isPostedDay, VIDEOS_PER_WEEKDAY } from "@/lib/creators/pay";
import type { PostedVideo } from "@/lib/creators/types";
import { errorResponse, requireCreator, requireOnboarded } from "../_auth";

// POST { videos: [{ tiktok_url, instagram_url }], date? } — date defaults to
// the creator's today; savePostingDay rejects anything past 11:59 pm their time.
// `day_complete` is set only when THIS save made the day count for pay (the
// end-of-day screen); a day the post sync already completed gets null.
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    const body = await req.json();
    const date = typeof body.date === "string" ? body.date : creatorToday(creator);
    const before = await getHistory(creator.id);
    const saved = await savePostingDay(creator.id, date, (body.videos ?? []) as PostedVideo[]);
    const complete = completeVideoCount(saved);
    let day_complete = null;
    if (complete >= VIDEOS_PER_WEEKDAY && !isPostedDay(before.postingDays, date)) {
      try {
        const [after, profile] = await Promise.all([getHistory(creator.id), hasStarted(creator) ? creator : getCreator(creator.id)]);
        if (profile && hasStarted(profile)) day_complete = dayComplete(profile, date, before.postingDays, after.postingDays, after.daysOff);
      } catch (e) {
        console.error("day complete numbers failed:", e); // the save itself went through
      }
    }
    return NextResponse.json({ log: saved, complete_videos: complete, day_complete });
  } catch (e) {
    return errorResponse(e, "posting");
  }
}
