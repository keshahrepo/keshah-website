/**
 * Top videos for the founder app: a creator's synced posts turned into videos
 * (a TikTok and an Instagram post of the same video count once, views added),
 * ranked by current views.
 *
 * Pairing is the same as the creator app's Videos tab (pairPosts in
 * keshah-creators-app lib/screens/creator/videos_tab.dart): per posting day,
 * when the day has the same number of TikToks and Instagram posts, the k-th
 * TikTok (by posted time) is paired with the k-th Instagram post. Otherwise
 * every post on that day is its own video.
 *
 * Bonus per video = what its approved bonus claims settle at (the same rule as
 * bonusLinesForMonth: 1M within 30 days of posting, else 100K within 30 days),
 * added across its platforms. No projection: a video with no approved claim
 * shows no bonus.
 */
import { BONUS_100K_CENTS, BONUS_1M_TOTAL_CENTS, BONUS_WINDOW_DAYS } from "@/lib/creators/pay";
import { postKey } from "@/lib/creators/scrape";
import type { BonusClaim } from "@/lib/creators/types";

export interface PostLite {
  platform: string;
  url: string;
  views: number;
  postedAt: string;
  localDate: string;
  thumbnail: string | null;
}

export interface TopVideo {
  /** Posting day (creator's timezone), yyyy-mm-dd. */
  postedOn: string;
  /** Total views across its posts (current counts). */
  views: number;
  tiktok: { url: string; views: number } | null;
  instagram: { url: string; views: number } | null;
  thumbnail: string | null;
  /** Bonus its approved claims earned, all platforms; 0 when none. */
  bonusCents: number;
  /** Set on the program-level list only. */
  creatorId?: string;
  creatorName?: string;
}

export const TOP_VIDEOS = 5;

/** Bonus cents per post (key = postKey), from approved claims at their final level. */
export function bonusByPost(claims: BonusClaim[]): Map<string, number> {
  const groups = new Map<string, { posted: string; c100?: string; c1m?: string }>();
  const minDate = (a?: string, b?: string) => (!a ? b : !b ? a : a < b ? a : b);
  for (const c of claims) {
    if (c.status !== "approved" || !c.video_url) continue;
    const key = postKey(c.video_url, c.platform);
    const g = groups.get(key) ?? { posted: c.posted_on };
    g.posted = minDate(g.posted, c.posted_on)!;
    g.c100 = minDate(g.c100, c.crossed_100k_on);
    g.c1m = minDate(g.c1m, c.crossed_1m_on);
    groups.set(key, g);
  }
  const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
  const within = (posted: string, crossed?: string) => {
    if (!crossed) return false;
    const d = days(posted, crossed);
    return d >= 0 && d <= BONUS_WINDOW_DAYS;
  };
  const out = new Map<string, number>();
  for (const [key, g] of groups) {
    const cents = within(g.posted, g.c1m) ? BONUS_1M_TOTAL_CENTS : within(g.posted, minDate(g.c100, g.c1m)) ? BONUS_100K_CENTS : 0;
    if (cents) out.set(key, cents);
  }
  return out;
}

/** Posts → videos, paired per day like the creator app. */
export function pairVideos(posts: PostLite[], bonus: Map<string, number> = new Map()): TopVideo[] {
  const byDay = new Map<string, PostLite[]>();
  for (const p of posts) {
    const day = p.localDate || p.postedAt.slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day)!.push(p);
  }
  const bonusOf = (p: PostLite) => bonus.get(postKey(p.url, p.platform === "tiktok" ? "tiktok" : "instagram")) ?? 0;
  const side = (p: PostLite | undefined) => (p ? { url: p.url, views: p.views } : null);
  const video = (day: string, tt: PostLite | undefined, ig: PostLite | undefined): TopVideo => ({
    postedOn: day,
    views: (tt?.views ?? 0) + (ig?.views ?? 0),
    tiktok: side(tt),
    instagram: side(ig),
    thumbnail: [tt?.thumbnail, ig?.thumbnail].find((u) => !!u) ?? null,
    bonusCents: (tt ? bonusOf(tt) : 0) + (ig ? bonusOf(ig) : 0),
  });
  const out: TopVideo[] = [];
  for (const [day, list] of byDay) {
    const byTime = (a: PostLite, b: PostLite) => a.postedAt.localeCompare(b.postedAt);
    const tt = list.filter((p) => p.platform === "tiktok").sort(byTime);
    const ig = list.filter((p) => p.platform === "instagram").sort(byTime);
    if (tt.length > 0 && tt.length === ig.length) {
      for (let k = 0; k < tt.length; k++) out.push(video(day, tt[k], ig[k]));
    } else {
      for (const p of tt) out.push(video(day, p, undefined));
      for (const p of ig) out.push(video(day, undefined, p));
    }
  }
  return out;
}

/** The n most-viewed (ties: newest first). */
export function topByViews(videos: TopVideo[], n = TOP_VIDEOS): TopVideo[] {
  return [...videos]
    .filter((v) => v.views > 0)
    .sort((a, b) => b.views - a.views || b.postedOn.localeCompare(a.postedOn))
    .slice(0, n);
}
