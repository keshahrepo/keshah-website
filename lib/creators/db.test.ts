// Run: npx tsx --test lib/creators/db.test.ts
// Pure helpers from db.ts only (nothing here touches Firestore).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CreatorDataError, checkInspiredByUrl, normalizeTrackingUrl } from "./db";
import { completeVideoCount } from "./pay";

test("inspired-by link is optional and accepts any full http(s) link", () => {
  assert.equal(checkInspiredByUrl(""), "");
  assert.equal(checkInspiredByUrl("   "), "");
  assert.equal(checkInspiredByUrl(" https://www.tiktok.com/@x/video/1 "), "https://www.tiktok.com/@x/video/1");
  assert.equal(checkInspiredByUrl("https://youtube.com/shorts/abc"), "https://youtube.com/shorts/abc");
});

test("inspired-by link rejects things that aren't links", () => {
  assert.throws(() => checkInspiredByUrl("tiktok video from yesterday"), CreatorDataError);
  assert.throws(() => checkInspiredByUrl("javascript:alert(1)"), CreatorDataError);
  assert.throws(() => checkInspiredByUrl("https://localhost"), CreatorDataError);
});

test("inspired-by link never changes the pay rule (both platform links still required)", () => {
  const day = {
    date: "2026-10-06",
    logged_at: "",
    videos: [{ tiktok_url: "https://www.tiktok.com/@x/video/1", instagram_url: "", inspired_by_url: "https://www.tiktok.com/@y/video/2" }],
  };
  assert.equal(completeVideoCount(day), 0);
});

test("tracking link must be https", () => {
  assert.equal(normalizeTrackingUrl(""), "");
  assert.equal(normalizeTrackingUrl("http://x.com"), null);
  assert.equal(normalizeTrackingUrl("https://x.com/a"), "https://x.com/a");
});
