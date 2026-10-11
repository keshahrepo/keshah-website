import { NextRequest, NextResponse } from "next/server";
import { claimDayComplete, creatorToday, getCreator, getHistory, hasStarted, savePostingDay } from "@/lib/creators/db";
import { completeVideoCount, dayComplete, isPostedDay, localDate, videosRequiredOn } from "@/lib/creators/pay";
import type { PostedVideo } from "@/lib/creators/types";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION } from "@/lib/creators/db";

import { errorResponse, requireCreator, requireNotEnded, requireOnboarded } from "../_auth";

// POST { videos: [{ tiktok_url, instagram_url }], date? } — date defaults to
// the creator's today; savePostingDay rejects anything past 11:59 pm their time.
// `day_complete` is set only when THIS save made the day count for pay (the
// end-of-day screen); a day the post sync already completed gets null, and so
// does a day already celebrated (claimDayComplete, shared with /posts/check).
export async function POST(req: NextRequest) {
  const creator = await requireCreator(req);
  if (creator instanceof NextResponse) return creator;
  const ended = requireNotEnded(creator);
  if (ended) return ended;
  const gated = await requireOnboarded(creator);
  if (gated) return gated;
  try {
    const body = await req.json();
    const date = typeof body.date === "string" ? body.date : creatorToday(creator);
    const before = await getHistory(creator.id);
    // Pasted links must be to videos posted that day: an old post can't fill a slot.
    const was = new Set(
      (before.postingDays.find((d) => d.date === date)?.videos ?? []).flatMap((v) => [v.tiktok_url, v.instagram_url]).filter(Boolean),
    );
    for (const v of (body.videos ?? []) as PostedVideo[]) {
      for (const url of [v.tiktok_url, v.instagram_url]) {
        if (!url || was.has(url)) continue;
        const posted = await postedOn(creator.id, url, creator.timezone);
        if (posted && posted < date) {
          return NextResponse.json({ error: `That ${url.includes("tiktok") ? "TikTok" : "Instagram"} link is to a video posted before today. Paste the one you posted today.` }, { status: 400 });
        }
      }
    }
    const saved = await savePostingDay(creator.id, date, (body.videos ?? []) as PostedVideo[]);
    const complete = completeVideoCount(saved);
    let day_complete = null;
    if (complete >= videosRequiredOn(creator, before.postingDays, date) && !isPostedDay(before.postingDays, date, creator)) {
      try {
        const [after, profile] = await Promise.all([getHistory(creator.id), hasStarted(creator) ? creator : getCreator(creator.id)]);
        if (profile && hasStarted(profile)) day_complete = dayComplete(profile, date, before.postingDays, after.postingDays, after.daysOff);
        // Once per day across this save and the app's "I posted it" check.
        if (day_complete && !(await claimDayComplete(creator.id, date))) day_complete = null;
      } catch (e) {
        console.error("day complete numbers failed:", e); // the save itself went through
      }
    }
    return NextResponse.json({ log: saved, complete_videos: complete, day_complete });
  } catch (e) {
    return errorResponse(e, "posting");
  }
}

/**
 * The local date a pasted video went up, when we can tell: TikTok ids carry their
 * upload time (top 32 bits = unix seconds); otherwise the synced post, if we have it.
 */
async function postedOn(creatorId: string, url: string, tz: string): Promise<string | null> {
  const tt = url.match(/tiktok\.com\/.*\/video\/(\d{15,25})/);
  if (tt) {
    const secs = Number(BigInt(tt[1]) >> BigInt(32));
    if (secs > 1_400_000_000) return localDate(new Date(secs * 1000).toISOString(), tz);
  }
  const ig = url.match(/instagram\.com\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/);
  if (ig) {
    const snap = await getFirebaseAdmin()
      .db.collection(CREATORS_COLLECTION).doc(creatorId).collection("posts")
      .where("post_id", "==", ig[1]).limit(1).get();
    const d = snap.docs[0]?.data();
    if (d && typeof d.local_date === "string") return d.local_date;
  }
  return null;
}
