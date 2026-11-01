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
