// Run: npx tsx --test lib/creators/proven.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  formatGroups,
  hookLineFrom,
  median,
  normalViews,
  pickIdeaCreators,
  rankCandidates,
  remakeRatio,
  selectDailyPicks,
  stampProvenIds,
  statsFrom,
  suggestReason,
  swapCandidate,
  tiredCheck,
  topUpPicks,
  weeklyGain,
  ideaInTest,
  type PickCandidate,
  type ViewPost,
} from "./proven";
import { parseTranscript, parseVideoViews, vttToText } from "./scrape";

const NOW = "2026-10-06T12:00:00.000Z";
const daysAgo = (n: number) => new Date(Date.parse(NOW) - n * 86400000).toISOString();
const post = (views: number, ago: number, extra: Partial<ViewPost> = {}): ViewPost => ({
  platform: "tiktok",
  posted_at: daysAgo(ago),
  views,
  pinned: false,
  ...extra,
});

// ---------------------------------------------------------------- normal views

test("median: odd, even, empty", () => {
  assert.equal(median([5, 1, 3]), 3);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});

test("normalViews: median of non-pinned posts from the last 30 days, per platform", () => {
  const posts = [
    post(1000, 1),
    post(2000, 5),
    post(3000, 10),
    post(9_000_000, 2, { pinned: true }), // pinned ignored
    post(500_000, 40), // too old
    post(50, 3, { platform: "instagram" }),
  ];
  assert.equal(normalViews(posts, NOW, "tiktok"), 2000);
  assert.equal(normalViews(posts, NOW, "instagram"), 50);
  assert.equal(normalViews(posts, NOW), 1500); // both platforms: 50, 1000, 2000, 3000
  assert.equal(normalViews([post(10, 45)], NOW), null);
});

// ---------------------------------------------------------------- suggestion rule

test("suggestReason: 100K+ within 30 days", () => {
  assert.match(suggestReason(post(100_000, 3), 90_000, NOW)!, /100K views/);
  assert.equal(suggestReason(post(100_000, 31), 1000, NOW), null); // too old
  assert.equal(suggestReason(post(500_000, 2, { pinned: true }), 1000, NOW), null);
});

test("suggestReason: 3x normal with a 20K floor", () => {
  assert.match(suggestReason(post(30_000, 2), 10_000, NOW)!, /3\.0x/);
  assert.equal(suggestReason(post(29_999, 2), 10_000, NOW), null); // under 3x
  assert.equal(suggestReason(post(15_000, 2), 1_000, NOW), null); // 15x but under 20K
  assert.match(suggestReason(post(20_000, 2), 1_000, NOW)!, /20\.0x/);
  assert.equal(suggestReason(post(50_000, 2), null, NOW), null); // no normal yet
});

// ---------------------------------------------------------------- daily picks

const cands = (ids: string[], extra: Record<string, Partial<PickCandidate>> = {}): PickCandidate[] =>
  ids.map((id) => ({ id, recent_wins: 0, views: 100_000, ...extra[id] }));

test("daily picks: least recently used first, never-used before used", () => {
  const picks = selectDailyPicks({
    candidates: cands(["a", "b", "c", "d", "e", "f", "g"]),
    history: { a: ["2026-10-05"], b: ["2026-09-20"], c: ["2026-10-01"] },
    date: "2026-10-06",
    count: 5,
    creatorId: "x",
  });
  assert.equal(picks.length, 5);
  assert.deepEqual(new Set(picks.slice(0, 4)), new Set(["d", "e", "f", "g"]));
  assert.equal(picks[4], "b"); // oldest use among the used ones
});

test("daily picks: recent winners break LRU ties", () => {
  const picks = selectDailyPicks({
    candidates: cands(["a", "b", "c"], { c: { recent_wins: 3 }, b: { recent_wins: 1 } }),
    history: {},
    date: "2026-10-06",
    count: 2,
    creatorId: "x",
  });
  assert.deepEqual(picks, ["c", "b"]);
});

test("daily picks: no duplicates in a day, even with a tiny list", () => {
  const picks = selectDailyPicks({ candidates: cands(["a", "b"]), history: {}, date: "2026-10-06", count: 5, creatorId: "x" });
  assert.deepEqual(new Set(picks), new Set(["a", "b"]));
  assert.equal(picks.length, 2);
});

test("daily picks: 2 per week cap is soft", () => {
  const history = { a: ["2026-10-02", "2026-10-05"], b: ["2026-09-01"], c: ["2026-10-03"] };
  // Plenty of room: a (used twice this week) is skipped even though c was used later than b.
  const three = selectDailyPicks({ candidates: cands(["a", "b", "c", "d"]), history, date: "2026-10-06", count: 3, creatorId: "x" });
  assert.deepEqual(three, ["d", "b", "c"]);
  // Too small a list: a fills the last slot rather than leaving it empty.
  const four = selectDailyPicks({ candidates: cands(["a", "b", "c", "d"]), history, date: "2026-10-06", count: 4, creatorId: "x" });
  assert.deepEqual(four, ["d", "b", "c", "a"]);
  // Uses older than 7 days don't count toward the week.
  const ranked = rankCandidates({ candidates: cands(["a"]), history: { a: ["2026-09-28", "2026-09-29"] }, date: "2026-10-06", count: 1, creatorId: "x" });
  assert.equal(ranked[0].week, 0);
});

test("daily picks: forced ideas first, audience respected", () => {
  const picks = selectDailyPicks({
    candidates: cands(["m", "w", "any", "x"], { m: { audience: "men" }, w: { audience: "women" }, any: { audience: "any" } }),
    history: {},
    date: "2026-10-06",
    count: 3,
    creatorId: "c1",
    creatorAudience: "men",
    forced: ["idea_1"],
  });
  assert.equal(picks[0], "idea_1");
  assert.ok(!picks.includes("w"));
  assert.equal(picks.length, 3);
});

test("swap: next best under the same rules, never something already shown today", () => {
  const base = { candidates: cands(["a", "b", "c", "d"]), history: { d: ["2026-09-01"] }, date: "2026-10-06", creatorId: "x" };
  assert.equal(swapCandidate({ ...base, current: ["a", "b"], swappedOut: ["c"] }), "d");
  assert.equal(swapCandidate({ ...base, current: ["a", "b"], swappedOut: ["c", "d"] }), null);
});

test("topUpPicks fills only empty slots", () => {
  const out = topUpPicks([{ slot: 0, proven_id: "a" }, { slot: 2, proven_id: "c" }], 4, ["x", "y", "z"]);
  assert.deepEqual(out, [
    { slot: 0, proven_id: "a" },
    { slot: 1, proven_id: "x" },
    { slot: 2, proven_id: "c" },
    { slot: 3, proven_id: "y" },
  ]);
});

// ---------------------------------------------------------------- ideas

test("idea assignment: trial/active creators who had an idea least recently", () => {
  const ids = pickIdeaCreators(
    [
      { id: "a", status: "active", last_idea_on: "2026-10-01" },
      { id: "b", status: "active", last_idea_on: "" },
      { id: "c", status: "trial", last_idea_on: "2026-09-01" },
      { id: "d", status: "ended", last_idea_on: "" },
      { id: "e", status: "onboarding", last_idea_on: "" },
      { id: "f", status: "active", last_idea_on: "2026-10-05" },
    ],
    "idea_1",
  );
  assert.deepEqual(ids, ["b", "c", "a"]);
  assert.deepEqual(pickIdeaCreators([{ id: "a", status: "active", last_idea_on: "" }], "idea_2"), ["a"]);
});

test("ideas stay with their test creators for a week", () => {
  assert.equal(ideaInTest({ added_by: "founder_idea", created_at: daysAgo(2) }, NOW), true);
  assert.equal(ideaInTest({ added_by: "founder_idea", created_at: daysAgo(8) }, NOW), false);
  assert.equal(ideaInTest({ added_by: "seed", created_at: daysAgo(1) }, NOW), false);
});

// ---------------------------------------------------------------- remakes + tired

test("stampProvenIds by row position, stale ids cleared", () => {
  const rows = [{ tiktok_url: "1" }, { tiktok_url: "2", proven_id: "old" }, { tiktok_url: "3", proven_id: "old" }];
  assert.deepEqual(stampProvenIds(rows, ["a", "b"]), [
    { tiktok_url: "1", proven_id: "a" },
    { tiktok_url: "2", proven_id: "b" },
    { tiktok_url: "3" },
  ]);
});

test("remakeRatio averages measurable platforms", () => {
  assert.equal(remakeRatio({ tiktok: 2000, instagram: 500 }, { tiktok: 1000, instagram: 1000 }), 1.25);
  assert.equal(remakeRatio({ tiktok: 2000, instagram: null }, { tiktok: 1000, instagram: 1000 }), 2);
  assert.equal(remakeRatio({ tiktok: 2000, instagram: 10 }, { tiktok: null, instagram: 0 }), null);
});

const rm = (creator_id: string, date: string, beat: boolean, judged = true) => ({ creator_id, date, beat, judged });

test("tired: >= 6 judged remakes, >= 3 creators, >= 14 days, most below, original flat", () => {
  const tired = [
    rm("a", "2026-09-01", false),
    rm("a", "2026-09-05", false),
    rm("b", "2026-09-08", false),
    rm("b", "2026-09-10", true),
    rm("c", "2026-09-12", false),
    rm("c", "2026-09-16", false),
  ];
  assert.equal(tiredCheck(tired, 2_000).flagged, true);
  assert.equal(tiredCheck(tired, null).flagged, true); // unknown trend still flags (founder decides)
  assert.match(tiredCheck(tired, null).reason, /couldn't tell/);
  assert.equal(tiredCheck(tired, 50_000).flagged, false); // original still pulling
  assert.equal(tiredCheck(tired.slice(0, 5), 0).flagged, false); // only 5
  assert.equal(tiredCheck(tired.map((r) => ({ ...r, creator_id: r.creator_id === "c" ? "a" : r.creator_id })), 0).flagged, false); // 2 creators
  assert.equal(tiredCheck(tired.map((r, i) => ({ ...r, date: `2026-09-0${i + 1}` })), 0).flagged, false); // 5-day span
  const half = tired.map((r, i) => ({ ...r, beat: i % 2 === 0 }));
  assert.equal(tiredCheck(half, 0).flagged, false); // 3 of 6 below is not "most"
  assert.equal(tiredCheck([...tired, rm("d", "2026-10-05", false, false)], 0).remakes, 6); // unjudged ignored
});

test("weeklyGain needs two observations 6+ days apart", () => {
  assert.equal(weeklyGain([{ at: daysAgo(0), views: 100 }]), null);
  assert.equal(weeklyGain([{ at: daysAgo(3), views: 0 }, { at: daysAgo(0), views: 100 }]), null);
  assert.equal(weeklyGain([{ at: daysAgo(14), views: 0 }, { at: daysAgo(0), views: 20_000 }]), 10_000);
});

test("statsFrom counts beats, judged, creators and recent wins", () => {
  const s = statsFrom([rm("a", "2026-10-01", true), rm("b", "2026-09-01", true), rm("a", "2026-10-05", false, false)], "2026-10-06");
  assert.deepEqual(s, {
    remakes: 3,
    beat_normal: 2,
    judged: 2,
    creators: 2,
    first_remake_on: "2026-09-01",
    last_remake_on: "2026-10-05",
    recent_wins: 1,
  });
});

// ---------------------------------------------------------------- text + parsing

test("hookLineFrom: first sentence, caption fallback without hashtags", () => {
  assert.equal(hookLineFrom("If you're losing hair, try this. Then do that."), "If you're losing hair, try this.");
  assert.equal(hookLineFrom("no punctuation at all"), "no punctuation at all");
  assert.equal(hookLineFrom("", "Watch till end. #hairloss #fyp"), "Watch till end.");
  assert.equal(hookLineFrom("", "#fyp"), "");
});

test("vttToText and parseTranscript", () => {
  const vtt = "WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.500\nIf you're losing hair,\n\n2\n00:00:01.500 --> 00:00:03.000\n<c>try this.</c>\n";
  assert.equal(vttToText(vtt), "If you're losing hair, try this.");
  assert.equal(parseTranscript("tiktok", { transcript: vtt }), "If you're losing hair, try this.");
  assert.equal(parseTranscript("instagram", { transcripts: [{ text: " Hello there. " }, { text: null }] }), "Hello there.");
  assert.equal(parseTranscript("instagram", { transcripts: null }), "");
});

test("parseVideoViews finds the biggest view count", () => {
  assert.equal(parseVideoViews({ aweme_detail: { statistics: { play_count: 1234 } } }), 1234);
  assert.equal(parseVideoViews({ data: { xdt_shortcode_media: { video_play_count: 50, video_view_count: 40 } } }), 50);
  assert.equal(parseVideoViews({ nothing: 1 }), null);
});

test("formatGroups: re-filmed hooks share a format led by the most viewed", () => {
  const g = formatGroups([
    { id: "a", hook: "Pinch the top of your scalp right now. Now pinch the sides. Feel the difference?", views: 100 },
    { id: "b", hook: "Pinch the top of your scalp right now. Now pinch the sides. Feel the difference? The top is tighter.", views: 900 },
    { id: "c", hook: "Are you using minoxidil? I just found out something crazy about it.", views: 50 },
    { id: "d", hook: "", views: 10 },
  ]);
  assert.equal(g.get("a"), "b");
  assert.equal(g.get("b"), "b");
  assert.equal(g.get("c"), "c");
  assert.equal(g.get("d"), "d");
});

test("selectDailyPicks: one video per format per day, formats rotate", () => {
  const candidates = [
    { id: "p1", format: "p", recent_wins: 0, views: 900 },
    { id: "p2", format: "p", recent_wins: 0, views: 800 },
    { id: "m1", format: "m", recent_wins: 0, views: 500 },
    { id: "e1", format: "e", recent_wins: 0, views: 100 },
  ];
  const day1 = selectDailyPicks({ candidates, history: {}, date: "2026-10-07", count: 2, creatorId: "c" });
  assert.deepEqual(day1, ["p1", "m1"]);
  // p was used yesterday through p1, so p2 waits behind the unused format e.
  const day2 = selectDailyPicks({ candidates, history: { p1: ["2026-10-07"], m1: ["2026-10-07"] }, date: "2026-10-08", count: 2, creatorId: "c" });
  assert.deepEqual(day2, ["e1", "p2"]);
});
