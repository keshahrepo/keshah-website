import { test } from "node:test";
import assert from "node:assert/strict";
import { hookPerformance } from "./hooks";

const r = (date: string, ratio: number | null, judged = true, tt: number | null = 1000) => ({ date, ratio, judged, views: { tiktok: tt, instagram: null } });

test("hook performance: core-era posts only, median of judged vs normal, best views", () => {
  const p = hookPerformance([r("2026-10-20", 9), r("2026-11-02", 0.5), r("2026-11-03", 2, true, 50000), r("2026-11-04", 1), r("2026-11-05", null, false, null)]);
  assert.equal(p.posts, 4);
  assert.equal(p.judged, 3);
  assert.equal(p.vs_normal, 1);
  assert.equal(p.best_views, 50000);
});

test("hook performance: nothing posted yet", () => {
  assert.deepEqual(hookPerformance([]), { posts: 0, judged: 0, vs_normal: null, best_views: null });
});

import { betterReference } from "@/lib/creators/proven";

const rm = (date: string, creator_id: string, tt: number | null, ig: number | null) => ({
  date, creator_id, tiktok_url: tt == null ? "" : `https://tt/${creator_id}/${date}`, instagram_url: ig == null ? "" : `https://ig/${creator_id}/${date}`, views: { tiktok: tt, instagram: ig },
});
const handles = { c1: { tiktok: "helen", instagram: "helen.ig" }, c2: { tiktok: "jay", instagram: "jay.ig" } };

test("reference: a core-era post that beats the original takes over, best platform wins", () => {
  const r = betterReference(215_000, [rm("2026-10-20", "c1", 9_000_000, null), rm("2026-11-03", "c1", 120_000, 80_000), rm("2026-11-04", "c2", 50_000, 400_000)], handles, "now");
  assert.deepEqual(r, { url: "https://ig/c2/2026-11-04", platform: "instagram", views: 400_000, creator_id: "c2", handle: "jay.ig", set_at: "now" });
});

test("reference: nothing beats the original -> keep it", () => {
  assert.equal(betterReference(2_000_000, [rm("2026-11-03", "c1", 150_000, null)], handles, "now"), null);
  assert.equal(betterReference(0, [], handles, "now"), null);
});
