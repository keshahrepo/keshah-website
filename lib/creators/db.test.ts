// Run: npx tsx --test lib/creators/db.test.ts
// Pure helpers from db.ts only (nothing here touches Firestore).
import { test } from "node:test";
import assert from "node:assert/strict";
import { CreatorDataError, checkInspiredByUrl, nextAutoStatus, normalizeTrackingUrl } from "./db";
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

test("status advances onboarding -> trial -> active, never backwards or over leaving/ended", () => {
  const full = (date: string) => ({
    date,
    logged_at: "",
    videos: Array.from({ length: 5 }, (_, i) => ({ tiktok_url: `https://www.tiktok.com/@x/video/${date}${i}`, instagram_url: `https://www.instagram.com/reel/${date}${i}/` })),
  });
  // Ten weekdays from Mon 2026-10-05.
  const ten = ["05", "06", "07", "08", "09", "12", "13", "14", "15", "16"].map((d) => full(`2026-10-${d}`));
  const nine = ten.slice(0, 9);
  assert.equal(nextAutoStatus("onboarding", false, ten), "onboarding");
  assert.equal(nextAutoStatus("onboarding", true, []), "trial");
  assert.equal(nextAutoStatus("onboarding", true, ten), "active");
  assert.equal(nextAutoStatus("trial", true, nine), "trial");
  assert.equal(nextAutoStatus("trial", true, ten), "active");
  // A weekend day with 5 videos doesn't count toward the trial (same rule as pay.ts).
  assert.equal(nextAutoStatus("trial", true, [...nine, full("2026-10-10")]), "trial");
  for (const s of ["active", "leaving", "ended"] as const) assert.equal(nextAutoStatus(s, true, ten), s);
});
