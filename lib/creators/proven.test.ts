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
  inRotation,
  hookPickable,
  hookShown,
  inTrialV2,
  givenFor,
  isFullCreator,
  comingWeek,
  scheduleIdeaBatch,
  ideaTestSummary,
  ideaOutcome,
  normalizeFormat,
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

test("suggestReason: only 100K+ counts, however far above their normal", () => {
  assert.equal(suggestReason(post(30_000, 2), 10_000, NOW), null); // 3x normal, under 100K
  assert.equal(suggestReason(post(99_999, 2), 1_000, NOW), null);
  assert.match(suggestReason(post(100_000, 2), 1_000, NOW)!, /100K views/);
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

test("daily picks: forced ideas are always picked and come last, audience respected", () => {
  const picks = selectDailyPicks({
    candidates: cands(["m", "w", "any", "x"], { m: { audience: "men" }, w: { audience: "women" }, any: { audience: "any" } }),
    history: {},
    date: "2026-10-06",
    count: 3,
    creatorId: "c1",
    creatorAudience: "men",
    forced: ["idea_1"],
  });
  assert.equal(picks[picks.length - 1], "idea_1");
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

test("ideas join the general rotation only once promoted", () => {
  assert.equal(inRotation({ added_by: "founder_idea" }), false);
  assert.equal(inRotation({ added_by: "founder_idea", test_result: "borderline" }), false);
  assert.equal(inRotation({ added_by: "founder_idea", test_result: "promoted" }), true);
  assert.equal(inRotation({ added_by: "seed" }), true);
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

test("selectDailyPicks: one per family a day; a re-upload counts as done", () => {
  const candidates = [
    { id: "p1", format: "p", family: "pinch", recent_wins: 0, views: 900 },
    { id: "p2", format: "p", family: "pinch", recent_wins: 0, views: 800 },
    { id: "m1", format: "m", family: "m", recent_wins: 0, views: 500 },
    { id: "e1", format: "e", family: "e", recent_wins: 0, views: 100 },
  ];
  const fam = (id: string) => candidates.find((c) => c.id === id)!.family;
  const day1 = selectDailyPicks({ candidates, history: {}, date: "2026-10-07", count: 3, creatorId: "c" });
  assert.equal(new Set(day1.map(fam)).size, 3, "three different families");
  // p1 was given yesterday, so its re-upload p2 is behind the unused format e.
  const day2 = selectDailyPicks({ candidates, history: { p1: ["2026-10-07"], m1: ["2026-10-07"] }, date: "2026-10-08", count: 1, creatorId: "c" });
  assert.deepEqual(day2, ["e1"]);
});

test("selectDailyPicks: a pinch variation can come the next day when nothing fresh is left, never two in a day", () => {
  const candidates = [
    { id: "top", format: "top", family: "pinch", recent_wins: 0, views: 900 },
    { id: "hairline", format: "hairline", family: "pinch", recent_wins: 0, views: 800 },
    { id: "m1", format: "m1", family: "m", recent_wins: 0, views: 100 },
  ];
  const day1 = selectDailyPicks({ candidates, history: {}, date: "2026-10-07", count: 2, creatorId: "c" });
  assert.equal(day1.filter((x) => x === "top" || x === "hairline").length, 1);
  const pinch = day1.find((x) => x !== "m1")!;
  const other = pinch === "top" ? "hairline" : "top";
  const next = selectDailyPicks({ candidates, history: { [pinch]: ["2026-10-07"], m1: ["2026-10-07"] }, date: "2026-10-08", count: 1, creatorId: "c" });
  assert.deepEqual(next, [other]);
});

test("rankCandidates: new creators get different videos, big ones still favoured", () => {
  const candidates = Array.from({ length: 40 }, (_, i) => ({ id: `v${i}`, recent_wins: 0, views: i < 5 ? 2_000_000 : 120_000 }));
  const first = (creatorId: string) => selectDailyPicks({ candidates, history: {}, date: "2026-10-08", count: 4, creatorId }).join(",");
  const days = new Set(["c1", "c2", "c3", "c4", "c5", "c6"].map(first));
  assert.ok(days.size >= 5, `creators should mostly differ, got ${days.size} distinct sets`);
});

// ---------------------------------------------------------------- trial count, no-repeat window, mix

const prof = (extra: Record<string, unknown> = {}) =>
  ({ status: "active", format_creator: false, ...extra }) as unknown as Parameters<typeof isFullCreator>[0];

test("trial v2 creators get 3 picks until the day after a keep decision; never ideas", () => {
  const trial = prof({ status: "trial", trial_plan: "v2" });
  assert.equal(inTrialV2(trial, "2026-10-07"), true);
  assert.equal(givenFor(trial, "2026-10-07"), 3);
  assert.equal(isFullCreator(trial, "2026-10-07"), false);
  const kept = prof({ trial_plan: "v2", trial_outcome: "keep", trial_decided_on: "2026-10-07" });
  assert.equal(givenFor(kept, "2026-10-07"), 3);
  assert.equal(givenFor(kept, "2026-10-08"), 5);
  assert.equal(isFullCreator(kept, "2026-10-08"), true);
  assert.equal(givenFor(prof({ format_creator: true }), "2026-10-07"), 3);
  assert.equal(isFullCreator(prof({ format_creator: true }), "2026-10-07"), false);
  assert.equal(givenFor(prof(), "2026-10-07"), 5);
  assert.equal(isFullCreator(prof({ status: "trial" }), "2026-10-07"), true); // original-plan trial
  assert.equal(isFullCreator(prof({ ended_on: "2026-10-01" }), "2026-10-07"), false);
});

test("no-repeat window: a family given in the last 21 days waits while fresh ones exist", () => {
  const candidates = cands(["p1", "p2", "m1", "e1"], { p1: { family: "pinch" }, p2: { family: "pinch" }, m1: { family: "m" }, e1: { family: "e" } });
  // p1 given 10 days ago: p2 (same family) is held back even though it was never given.
  const picks = selectDailyPicks({ candidates, history: { p1: ["2026-09-27"] }, date: "2026-10-07", count: 2, creatorId: "c" });
  assert.deepEqual(new Set(picks), new Set(["m1", "e1"]));
  // 21+ days later the family is fresh again.
  const later = selectDailyPicks({ candidates, history: { p1: ["2026-09-16"], m1: ["2026-10-06"], e1: ["2026-10-06"] }, date: "2026-10-07", count: 1, creatorId: "c" });
  assert.equal(candidates.find((c) => c.id === later[0])!.family, "pinch");
});

test("no-repeat window: pool dry falls back to the least recently used family", () => {
  const candidates = cands(["a", "b", "c"], { a: { family: "A" }, b: { family: "B" }, c: { family: "C" } });
  const history = { a: ["2026-10-01"], b: ["2026-09-25"], c: ["2026-10-05"] };
  const picks = selectDailyPicks({ candidates, history, date: "2026-10-07", count: 3, creatorId: "c" });
  assert.deepEqual(picks, ["b", "a", "c"]);
});

test("full creator mix: up to 2 ideas, 2 self-tests and 1 other format among proven picks", () => {
  const ids = ["s1", "s2", "s3", "s4", "x1", "x2", "n1"];
  const candidates = cands(ids, {
    s1: { video_format: "self-test", views: 9_000_000 },
    s2: { video_format: "self-test" },
    s3: { video_format: "self-test", views: 5_000_000 },
    s4: { video_format: "self-test", views: 5_000_000 },
    x1: { video_format: "myth-bust" },
    x2: { video_format: "explainer" },
    n1: {},
  });
  const fmtOf = (id: string) => candidates.find((c) => c.id === id)?.video_format;
  for (const creatorId of ["a", "b", "c", "d"]) {
    const picks = selectDailyPicks({
      candidates,
      history: {},
      date: "2026-10-07",
      count: 5,
      creatorId,
      forced: ["idea_1", "idea_2"],
      mix: { selfTest: 2, other: 1 },
    });
    assert.deepEqual(picks.slice(-2), ["idea_1", "idea_2"]);
    const proven = picks.slice(2);
    assert.equal(proven.filter((id) => fmtOf(id) === "self-test").length, 2, creatorId);
    assert.equal(proven.filter((id) => fmtOf(id) && fmtOf(id) !== "self-test").length, 1, creatorId);
  }
  // Soft: no self-tests at all still fills every slot.
  const none = selectDailyPicks({ candidates: cands(["x1", "x2", "x3"], { x1: { video_format: "list" } }), history: {}, date: "2026-10-07", count: 3, creatorId: "a", mix: { selfTest: 2, other: 1 } });
  assert.equal(none.length, 3);
});

// ---------------------------------------------------------------- idea batches + outcomes

test("comingWeek: Monday to Friday of next week", () => {
  assert.deepEqual(comingWeek("2026-10-17"), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23"]); // Saturday
  assert.equal(comingWeek("2026-10-19")[0], "2026-10-26"); // a Monday gives next week's
  assert.equal(comingWeek("2026-10-18")[0], "2026-10-19"); // Sunday
});

const WEEK = comingWeek("2026-10-17");

test("scheduleIdeaBatch: one creator, 10 ideas -> 2 a day Mon-Fri", () => {
  const ideas = Array.from({ length: 10 }, (_, i) => `i${i}`);
  const plan = scheduleIdeaBatch(ideas, ["solo"], WEEK);
  const perDay = new Map<string, number>();
  for (const id of ideas) {
    assert.equal(plan[id].length, 1);
    perDay.set(plan[id][0].date, (perDay.get(plan[id][0].date) ?? 0) + 1);
  }
  assert.deepEqual([...perDay.values()], [2, 2, 2, 2, 2]);
});

test("scheduleIdeaBatch: up to 5 different creators an idea, never more than 2 a creator a day", () => {
  const creators = Array.from({ length: 7 }, (_, i) => `c${i}`);
  const ideas = Array.from({ length: 12 }, (_, i) => `i${i}`);
  const booked = [{ creator_id: "c0", date: WEEK[0] }, { creator_id: "c0", date: WEEK[0] }];
  const plan = scheduleIdeaBatch(ideas, creators, WEEK, { booked });
  const load = new Map<string, number>([[`c0|${WEEK[0]}`, 2]]);
  for (const id of ideas) {
    assert.equal(plan[id].length, 5);
    assert.equal(new Set(plan[id].map((a) => a.creator_id)).size, 5);
    for (const a of plan[id]) {
      assert.ok(WEEK.includes(a.date));
      load.set(`${a.creator_id}|${a.date}`, (load.get(`${a.creator_id}|${a.date}`) ?? 0) + 1);
    }
  }
  assert.ok([...load.values()].every((n) => n <= 2));
  // Two creators: each idea goes to both.
  assert.equal(scheduleIdeaBatch(["x"], ["a", "b"], WEEK).x.length, 2);
  // Past capacity (1 creator, 2 a day, 5 days): the 11th idea gets nobody.
  const full = scheduleIdeaBatch(Array.from({ length: 11 }, (_, i) => `f${i}`), ["solo"], WEEK);
  assert.equal(full.f10.length, 0);
});

const remake = (creator_id: string, date: string, tiktok: number | null, instagram: number | null = null) => ({
  creator_id,
  date,
  views: { tiktok, instagram },
  tiktok_url: `https://tiktok.com/${creator_id}`,
  instagram_url: "",
});

test("idea tests: summary keeps 3d/7d views; judged 7 days after the last scheduled day", () => {
  const assigned = [{ creator_id: "a", date: "2026-10-19" }, { creator_id: "b", date: "2026-10-21" }];
  const day1 = ideaTestSummary(assigned, [remake("a", "2026-10-19", 5_000)], undefined, "2026-10-22", NOW);
  assert.equal(day1.judge_on, "2026-10-28");
  assert.equal(day1.creators, 2);
  assert.equal(day1.remakes[0].views_3d, 5_000);
  assert.equal(day1.remakes[0].views_7d, undefined);
  const day2 = ideaTestSummary(assigned, [remake("a", "2026-10-19", 40_000, 60_000), remake("b", "2026-10-21", 1_000)], day1, "2026-10-26", NOW);
  assert.equal(day2.remakes[0].views_3d, 5_000); // kept from the earlier run
  assert.equal(day2.remakes[0].views_7d, 60_000); // better platform
  assert.equal(day2.best_views, 60_000);
  assert.equal(day2.posts, 2);
  assert.equal(ideaOutcome(day2, "2026-10-27"), null);
  assert.equal(ideaOutcome(day2, "2026-10-28"), "borderline");
});

test("ideaOutcome: 100K+ promotes, all under 20K drops, nobody posting is borderline", () => {
  const t = (views: (number | null)[]) => ({ judge_on: "2026-10-28", remakes: views.map((v, i) => ({ creator_id: `c${i}`, date: "2026-10-20", views: v })) });
  assert.equal(ideaOutcome(t([5_000, 120_000]), "2026-10-28"), "promoted");
  assert.equal(ideaOutcome(t([5_000, 19_999, null]), "2026-10-28"), "dropped");
  assert.equal(ideaOutcome(t([5_000, 20_000]), "2026-10-28"), "borderline");
  assert.equal(ideaOutcome(t([]), "2026-10-28"), "borderline");
});

// ---------------------------------------------------------------- stored tags + third-person hooks

test("normalizeFormat maps tagging names onto the stored list", () => {
  assert.equal(normalizeFormat("list/plan"), "list");
  assert.equal(normalizeFormat("how-to promise"), "how-to-promise");
  assert.equal(normalizeFormat("Personal story"), "personal-story");
  assert.equal(normalizeFormat("self-test"), "self-test");
  assert.equal(normalizeFormat("nonsense"), undefined);
});

test("first-person videos are pickable with a third-person hook, which is shown instead", () => {
  assert.equal(hookPickable({ hook_first_person: true }), false);
  assert.equal(hookPickable({ hook_first_person: true, hook_third_person: "He fixed his hair loss in a year." }), true);
  assert.equal(hookPickable({ hook_first_person: false }), true);
  const v = { hook_line: "I fixed it.", hook_full: "I fixed my hair loss in a year.", hook_first_person: true, hook_third_person: "He fixed his hair loss in a year." };
  assert.equal(hookShown(v), "He fixed his hair loss in a year.");
  assert.equal(hookShown({ ...v, hook_first_person: false }), "I fixed my hair loss in a year.");
  assert.equal(hookShown({ ...v, hook_third_person: undefined, hook_edited: true }), "I fixed it.");
});
