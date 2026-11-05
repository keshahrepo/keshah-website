import { test } from "node:test";
import assert from "node:assert/strict";
import { postingKitFor, KIT_TIKTOK_CAPTION, KIT_TIKTOK_STICKER, KIT_INSTAGRAM_STICKER } from "./posting-kit";

test("posting kit: TikTok caption + sticker, Instagram sticker, Isai's profile screenshot only for Isai", () => {
  const isai = postingKitFor("g6r5nar0MkQb6w4iMBtD", "https://www.keshah.com");
  assert.equal(isai.tiktok.caption, KIT_TIKTOK_CAPTION);
  assert.equal(isai.tiktok.sticker, KIT_TIKTOK_STICKER);
  assert.equal(isai.instagram.sticker, KIT_INSTAGRAM_STICKER);
  assert.equal(isai.instagram.profile_shot_url, "https://www.keshah.com/creator-assets/posting-kit/profile-isai.png");
  assert.match(isai.tiktok.example_url, /tiktok-example\.jpg$/);
  assert.equal(postingKitFor("someone-else").instagram.profile_shot_url, null);
});
