import { test } from "node:test";
import assert from "node:assert/strict";
import { NICHE_QUERIES, NICHE_SCAN_MAX_REQUESTS, nicheScanDue, parseInstagramSearch, parseTiktokSearch, rankNicheVideos } from "./niche-scan";

const q = { platform: "tiktok" as const, niche: "posture", query: "posture test" };

test("queries fit under the request cap", () => {
  assert.ok(NICHE_QUERIES.length <= NICHE_SCAN_MAX_REQUESTS);
});

test("parses TikTok keyword search results", () => {
  const d = {
    search_item_list: [
      { aweme_info: { aweme_id: "71", desc: "wall test", create_time: 1760000000, share_url: "https://www.tiktok.com/@a/video/71?x=1", author: { unique_id: "a" }, statistics: { play_count: 5000000, digg_count: 400000, comment_count: 2000, share_count: 9000 } } },
      { aweme_info: {} },
    ],
  };
  const v = parseTiktokSearch(d, q);
  assert.equal(v.length, 1);
  assert.equal(v[0].url, "https://www.tiktok.com/@a/video/71");
  assert.equal(v[0].views, 5000000);
  assert.equal(v[0].shares, 9000);
  assert.equal(v[0].posted_at, new Date(1760000000 * 1000).toISOString());
});

test("parses Instagram reel search defensively", () => {
  const v = parseInstagramSearch({ reels: [{ shortcode: "ABC", caption: { text: "hi" }, owner: { username: "b" }, like_count: 10, taken_at: 1760000000 }] }, { ...q, platform: "instagram" });
  assert.equal(v[0].url, "https://www.instagram.com/reel/ABC/");
  assert.equal(v[0].caption, "hi");
  assert.equal(v[0].views, 0);
  assert.deepEqual(parseInstagramSearch({ nope: 1 }, q), []);
});

test("rank dedupes by URL and sorts by views then likes", () => {
  const base = { platform: "tiktok" as const, niche: "x", query: "y", handle: "h", comments: 0, shares: 0, caption: "", posted_at: null };
  const r = rankNicheVideos([
    { ...base, url: "u1", views: 10, likes: 1 },
    { ...base, url: "u2", views: 50, likes: 1 },
    { ...base, url: "u1", views: 20, likes: 1 },
  ]);
  assert.deepEqual(r.map((x) => [x.url, x.views]), [["u2", 50], ["u1", 20]]);
});

test("due on Mondays from 13:00 UTC once, or on request", () => {
  const mon = new Date("2026-10-19T13:05:00Z");
  assert.equal(nicheScanDue({ now: mon, requested: false, last: null }), true);
  assert.equal(nicheScanDue({ now: mon, requested: false, last: "2026-10-19" }), false);
  assert.equal(nicheScanDue({ now: new Date("2026-10-19T12:00:00Z"), requested: false, last: null }), false);
  assert.equal(nicheScanDue({ now: new Date("2026-10-17T15:00:00Z"), requested: true, last: "2026-10-12" }), true);
});
