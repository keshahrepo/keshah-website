/**
 * Posting kit: what a creator adds when posting (not filmed), so viewers find the
 * WATCH THIS FIRST video in one tap. Switched on per creator (ContentCreators/{id}.posting_kit),
 * Isai first (test from 2026-11-09, metric: installs per 1K views).
 *
 * TikTok: caption with a link to the pinned video, plus a sticker pointing at it.
 * Instagram: no caption; a sticker above the profile picture, plus a screenshot of
 * the creator's own profile with WATCH THIS FIRST circled (one per creator).
 */

export interface PostingKit {
  tiktok: { caption: string; sticker: string; example_url: string };
  instagram: { sticker: string; example_url: string; profile_shot_url: string | null };
}

export const KIT_TIKTOK_CAPTION = "My routine to stop hair loss 👉";
export const KIT_TIKTOK_STICKER = "or just tap here 👇";
export const KIT_INSTAGRAM_STICKER = "👇 tap my face and watch pinned reel";
const BASE = "/creator-assets/posting-kit";

/** Profile screenshots made so far (creator id -> file in public/creator-assets/posting-kit). */
const PROFILE_SHOTS: Record<string, string> = {
  g6r5nar0MkQb6w4iMBtD: "profile-isai.png",
};

export function postingKitFor(creatorId: string, siteUrl = ""): PostingKit {
  const shot = PROFILE_SHOTS[creatorId];
  return {
    tiktok: { caption: KIT_TIKTOK_CAPTION, sticker: KIT_TIKTOK_STICKER, example_url: `${siteUrl}${BASE}/tiktok-example.jpg` },
    instagram: { sticker: KIT_INSTAGRAM_STICKER, example_url: `${siteUrl}${BASE}/instagram-example.jpg`, profile_shot_url: shot ? `${siteUrl}${BASE}/${shot}` : null },
  };
}
