// Run: npx tsx --test lib/founder/content-build.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildLibrary, buildPeriod, buildTests, buildTrending, periodWindow, trialsPer1k, type IdeaInfo } from "./content-build";
import { toScript } from "@/lib/creators/content";
import type { LibVideo } from "@/lib/creators/content-select";
import { pageWeekOf } from "./content";

test("period window: a month, all time, default", () => {
  assert.deepEqual(periodWindow("2026-12"), { key: "2026-12", label: "December 2026", from: "2026-12-01", to: "2027-01-01" });
  assert.deepEqual(periodWindow("all"), { key: "all", label: "All time", from: "2026-09-01", to: null });
  assert.equal(periodWindow(null, new Date("2026-10-17T00:00:00Z")).key, "2026-10");
});

test("period: views, hits at 100K / 500K / 1M, new-script share or null", () => {
  const posts = [
    { creator_id: "a", url: "u1", views: 1_200_000 },
    { creator_id: "a", url: "u2", views: 600_000 },
    { creator_id: "b", url: "u3", views: 200_000 },
  ];
  const p = buildPeriod("October 2026", posts, new Set(["u3"]));
  assert.deepEqual(p, { label: "October 2026", views: 2_000_000, hits_100k: 3, hits_500k: 2, hits_1m: 1, new_script_share: 0.1 });
  assert.equal(buildPeriod("x", posts, new Set()).new_script_share, null);
  assert.equal(buildPeriod("x", posts, null).new_script_share, null);
  assert.equal(buildPeriod("x", null, null).views, null);
});

const s = (id: string, over: Record<string, unknown>) =>
  toScript(id, { week_of: "2026-10-19", slot: 1, title: id, hook: `hook ${id}`, format: "self-test", source: "adapted", status: "approved", ...over });

test("tests: counts, win rate over judged, by format / source, weeks newest first, best by views", () => {
  const scripts = [
    s("a", { idea_id: "ia", slot: 2 }),
    s("b", { idea_id: "ib", slot: 1, format: "myth-bust", source: "revival" }),
    s("c", { idea_id: "ic", week_of: "2026-10-26" }),
    s("d", { status: "draft" }),
  ];
  const ideas = new Map<string, IdeaInfo>([
    ["ia", { test_result: "promoted", assignments: ["k1"], test: { creators: 1, posts: 1, best_views: 150_000, remakes: [{ creator_id: "k1", date: "2026-10-19", views: 150_000, views_3d: 90_000, views_7d: 140_000 }], judge_on: "2026-10-30", updated_at: "" } }],
    ["ib", { test_result: "dropped", assignments: ["k2"] }],
    ["ic", { assignments: [] }],
  ]);
  const t = buildTests(scripts, ideas, new Map([["k1", "Isai"]]));
  assert.deepEqual([t.tested, t.won, t.dropped, t.running, t.win_rate], [3, 1, 1, 1, 0.5]);
  assert.deepEqual(t.weeks.map((w) => w.week_of), ["2026-10-26", "2026-10-19"]);
  assert.deepEqual(t.weeks[1].scripts.map((r) => r.id), ["b", "a"]);
  const a = t.weeks[1].scripts[1];
  assert.deepEqual(a, { id: "a", title: "a", hook: "hook a", format: "self-test", source: "adapted", creators: ["Isai"], views_3d: 90_000, views_7d: 140_000, views: 150_000, result: "won" });
  assert.deepEqual(t.by_source.find((x) => x.key === "revival"), { key: "revival", tested: 1, won: 0 });
  assert.deepEqual(t.best.map((r) => r.id), ["a"]);
  assert.equal(buildTests([], new Map(), new Map()).win_rate, null);
});

const v = (id: string, over: Partial<LibVideo>): LibVideo => ({
  id, status: "active", format: "self-test", hook_family: "f1", views: 100_000, hook_line: `h ${id}`, added_by: "seed",
  stats: { remakes: 0, beat_normal: 0, judged: 0, last_remake_on: null, recent_wins: 0 }, ...over,
});

test("library: totals by stored format, tired flags, rising families", () => {
  const lib = buildLibrary([
    v("a", { tired: { flagged: true } }),
    v("b", { format: "myth-bust", hook_family: "f2", stats: { remakes: 4, beat_normal: 3, judged: 4, last_remake_on: "2026-10-15", recent_wins: 2 } }),
    v("c", { status: "retired" }),
  ], "2026-10-17");
  assert.equal(lib.total, 2);
  assert.deepEqual(lib.by_format, [{ key: "myth-bust", count: 1 }, { key: "self-test", count: 1 }]);
  assert.deepEqual(lib.tired, [{ id: "a", hook: "h a", family: "f1" }]);
  assert.deepEqual(lib.rising, [{ id: "b", hook: "h b", family: "f2" }]);
});

test("trending: top items, first sentence as hook, adapted flag", () => {
  const item = (url: string, views: number) => ({ url, handle: "h", platform: "tiktok" as const, niche: "hair", views, caption: "Try this. Then that.", source: "keyword", query: "", likes: 0, comments: 0, shares: 0, posted_at: null });
  const t = buildTrending({ id: "2026-10-17", finished_at: null, items: { videos: [item("x", 5), item("y", 9)], accounts: [], hair: [] } }, new Set(["x"]));
  assert.equal(t.scanned_at, "2026-10-17");
  assert.deepEqual(t.videos.map((x) => [x.url, x.adapted, x.hook]), [["y", false, "Try this."], ["x", true, "Try this."]]);
  assert.deepEqual(buildTrending(null, new Set()), { scanned_at: null, videos: [] });
});

test("trials per 1K views: null when unknown, never estimated", () => {
  assert.equal(trialsPer1k(5, 10_000), 0.5);
  assert.equal(trialsPer1k(null, 10_000), null);
  assert.equal(trialsPer1k(3, 0), null);
});

test("page week: this Monday on weekdays, next Monday on weekends", () => {
  assert.equal(pageWeekOf("2026-10-17"), "2026-10-19");
  assert.equal(pageWeekOf("2026-10-18"), "2026-10-19");
  assert.equal(pageWeekOf("2026-10-21"), "2026-10-19");
  assert.equal(pageWeekOf("2026-10-19"), "2026-10-19");
});
