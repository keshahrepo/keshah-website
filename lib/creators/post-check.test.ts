// Run: npx tsx --test lib/creators/post-check.test.ts
// "I posted it" check: rate limit, slot attribution, day_complete once, thumbnails.
// Nothing here touches Firestore or ScrapeCreators (runner deps are in memory).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHECK_COOLDOWN_S,
  attributeSlot,
  parseCheckInput,
  rateDecision,
  runPostCheck,
  stampRow,
  todayCounts,
  type PostCheckDeps,
  type TodayPost,
} from "./post-check";
import type { SlotAttribution } from "./proven";
import { instagramThumb, parseInstagramPage, parseTikTokPage, tiktokThumb } from "./scrape";
import type { CreatorProfile, PostedVideo, PostingDay } from "./types";

const TODAY = "2026-10-07"; // a Wednesday
const NOW = new Date("2026-10-07T20:00:00.000Z"); // 3 pm in Chicago
const tt = (n: number) => `https://www.tiktok.com/@jen/video/74210000000000000${n}`;
const ig = (n: number) => `https://www.instagram.com/reel/DAbc00${n}/`;
const post = (platform: "tiktok" | "instagram", n: number, hour: number, views = 100): TodayPost => ({
  platform,
  url: platform === "tiktok" ? tt(n) : ig(n),
  posted_at: `${TODAY}T${String(hour).padStart(2, "0")}:00:00.000Z`,
  views,
  thumbnail_url: null,
});

const creator = {
  id: "c1",
  name: "Jen",
  timezone: "America/Chicago",
  start_date: "2026-10-01",
  starting_completed_months: 0,
} as unknown as CreatorProfile;

// ---------------------------------------------------------------- rate limit

test("rateDecision: one check per 30s, with seconds left", () => {
  const t = NOW.getTime();
  assert.deepEqual(rateDecision(null, t), { ok: true });
  assert.deepEqual(rateDecision("garbage", t), { ok: true });
  assert.deepEqual(rateDecision(new Date(t - 10_000).toISOString(), t), { ok: false, retry_after_s: 20 });
  assert.deepEqual(rateDecision(new Date(t - 29_500).toISOString(), t), { ok: false, retry_after_s: 1 });
  assert.deepEqual(rateDecision(new Date(t - CHECK_COOLDOWN_S * 1000).toISOString(), t), { ok: true });
});

// ---------------------------------------------------------------- attribution

test("attributeSlot: newest unattributed TikTok and Reel go to the slot", () => {
  const posts = [post("tiktok", 1, 14), post("tiktok", 2, 16), post("instagram", 1, 15), post("instagram", 2, 17)];
  const r = attributeSlot({}, 0, "pv1", posts, NOW.toISOString());
  assert.equal(r.changed, true);
  assert.equal(r.attribution?.tiktok_url, tt(2));
  assert.equal(r.attribution?.instagram_url, ig(2));
  assert.equal(r.attribution?.proven_id, "pv1");
  // The next slot gets the next newest, never the ones slot 0 has.
  const r2 = attributeSlot(r.map, 1, "pv2", posts, NOW.toISOString());
  assert.equal(r2.attribution?.tiktok_url, tt(1));
  assert.equal(r2.attribution?.instagram_url, ig(1));
  // A third slot finds nothing left.
  const r3 = attributeSlot(r2.map, 2, "pv3", posts, NOW.toISOString());
  assert.equal(r3.attribution, null);
  assert.equal(r3.changed, false);
});

test("attributeSlot: re-checking a slot keeps its posts and fills the missing platform later", () => {
  const first = attributeSlot({}, 3, "pv4", [post("tiktok", 1, 14)], NOW.toISOString());
  assert.equal(first.attribution?.tiktok_url, tt(1));
  assert.equal(first.attribution?.instagram_url, undefined);
  // Same posts again: nothing to write.
  const again = attributeSlot(first.map, 3, "pv4", [post("tiktok", 1, 14)], NOW.toISOString());
  assert.equal(again.changed, false);
  assert.equal(again.attribution?.tiktok_url, tt(1));
  // A newer TikTok shows up plus the Reel: the TikTok stays, the Reel is added.
  const later = attributeSlot(first.map, 3, "pv4", [post("tiktok", 1, 14), post("tiktok", 2, 18), post("instagram", 1, 15)], NOW.toISOString());
  assert.equal(later.changed, true);
  assert.equal(later.attribution?.tiktok_url, tt(1));
  assert.equal(later.attribution?.instagram_url, ig(1));
});

test("attributeSlot: matches links however they were pasted (post ids, not exact strings)", () => {
  const map: Record<string, SlotAttribution> = { "0": { proven_id: "pv1", tiktok_url: `${tt(2)}?is_from_webapp=1`, at: "x" } };
  const r = attributeSlot(map, 1, "pv2", [post("tiktok", 2, 16)], NOW.toISOString());
  assert.equal(r.attribution, null);
});

test("stampRow: stamps the slot's proven id on the row with its links, once", () => {
  const rows: PostedVideo[] = [
    { tiktok_url: tt(1), instagram_url: ig(1) },
    { tiktok_url: tt(2), instagram_url: ig(2), proven_id: "pv9" },
  ];
  const a: SlotAttribution = { proven_id: "pv1", tiktok_url: tt(1), instagram_url: ig(1), at: "x" };
  const out = stampRow(rows, a)!;
  assert.equal(out[0].proven_id, "pv1");
  assert.equal(stampRow(out, a), null); // already there
  assert.equal(stampRow(rows, { ...a, tiktok_url: tt(2), instagram_url: ig(2) }), null); // row has another pick
});

test("todayCounts: union of detected posts and saved links, complete pairs", () => {
  const log: PostingDay = { date: TODAY, videos: [{ tiktok_url: `${tt(1)}?x=1`, instagram_url: ig(1) }, { tiktok_url: tt(3), instagram_url: "" }], logged_at: "" };
  const c = todayCounts([post("tiktok", 1, 14), post("tiktok", 2, 15), post("instagram", 2, 16)], log, false, "d");
  assert.deepEqual(c, { tiktok: 3, instagram: 2, counted: false, posted_videos: 2, deadline_iso: "d" });
});

test("parseCheckInput: slot 0-4, proven_id needs a slot", () => {
  assert.deepEqual(parseCheckInput({}), {});
  assert.deepEqual(parseCheckInput({ slot: 2, proven_id: "tiktok_123" }), { slot: 2, proven_id: "tiktok_123" });
  assert.ok("error" in parseCheckInput({ slot: 5 }));
  assert.ok("error" in parseCheckInput({ slot: 1.5 }));
  assert.ok("error" in parseCheckInput({ proven_id: "pv1" }));
  assert.ok("error" in parseCheckInput({ slot: 0, proven_id: "a/b" }));
});

// ---------------------------------------------------------------- runner (in-memory)

function memory(opts: { posted?: number } = {}) {
  const state = {
    lastCheck: null as string | null,
    syncs: 0,
    days: [] as PostingDay[],
    posts: [] as TodayPost[],
    attribution: {} as Record<string, SlotAttribution>,
    celebrated: new Set<string>(),
    /** What the next sync "finds" (pushed into posts and the day's rows). */
    pending: [] as TodayPost[],
  };
  const row = (n: number): PostedVideo => ({ tiktok_url: tt(n), instagram_url: ig(n) });
  const earlier = ["2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06"].map((date) => ({ date, videos: [1, 2, 3, 4, 5].map(row), logged_at: "" }));
  state.days = [...earlier, { date: TODAY, videos: Array.from({ length: opts.posted ?? 0 }, (_, i) => row(i + 1)), logged_at: "" }];
  for (let n = 1; n <= (opts.posted ?? 0); n++) state.posts.push(post("tiktok", n, 10 + n), post("instagram", n, 10 + n));
  const deps: PostCheckDeps = {
    now: NOW,
    claimRate: async (_id, now) => {
      const d = rateDecision(state.lastCheck, now.getTime());
      if (d.ok) state.lastCheck = now.toISOString();
      return d;
    },
    sync: async () => {
      state.syncs++;
      for (const p of state.pending) state.posts.push(p);
      const today = state.days.find((d) => d.date === TODAY)!;
      const tts = state.posts.filter((p) => p.platform === "tiktok").sort((a, b) => a.posted_at.localeCompare(b.posted_at));
      const igs = state.posts.filter((p) => p.platform === "instagram").sort((a, b) => a.posted_at.localeCompare(b.posted_at));
      today.videos = Array.from({ length: Math.max(tts.length, igs.length) }, (_, i) => ({ tiktok_url: tts[i]?.url ?? "", instagram_url: igs[i]?.url ?? "" }));
      state.pending = [];
    },
    history: async () => ({ postingDays: state.days.map((d) => ({ ...d, videos: d.videos.map((v) => ({ ...v })) })), daysOff: [] }),
    todayPosts: async () => [...state.posts].sort((a, b) => b.posted_at.localeCompare(a.posted_at)),
    attribute: async (_id, _date, slot, provenId, posts, nowIso) => {
      const r = attributeSlot(state.attribution, slot, provenId, posts, nowIso);
      state.attribution = r.map;
      return r.attribution;
    },
    claimDayComplete: async (_id, date) => {
      if (state.celebrated.has(date)) return false;
      state.celebrated.add(date);
      return true;
    },
    reloadCreator: async () => creator,
  };
  return { state, deps };
}

test("runPostCheck: second check inside 30s is a 429 and does not sync", async () => {
  const { state, deps } = memory();
  const a = await runPostCheck(creator, {}, deps);
  assert.equal(a.status, 200);
  const b = await runPostCheck(creator, {}, { ...deps, now: new Date(NOW.getTime() + 12_000) });
  assert.deepEqual(b, { status: 429, retry_after_s: 18 });
  assert.equal(state.syncs, 1);
  const c = await runPostCheck(creator, {}, { ...deps, now: new Date(NOW.getTime() + 31_000) });
  assert.equal(c.status, 200);
  assert.equal(state.syncs, 2);
});

test("runPostCheck: not found, then found on TikTok only, then both", async () => {
  const { state, deps } = memory({ posted: 2 });
  let t = NOW.getTime();
  const at = () => ({ ...deps, now: new Date((t += 31_000)) });
  // Slots 0 and 1 claim the two posts already up.
  await runPostCheck(creator, { slot: 0, proven_id: "pv1" }, at());
  await runPostCheck(creator, { slot: 1, proven_id: "pv2" }, at());
  const none = await runPostCheck(creator, { slot: 2, proven_id: "pv3" }, at());
  assert.equal(none.status, 200);
  if (none.status !== 200) return;
  assert.equal(none.body.found_for_slot, null);
  assert.equal(none.body.today.posted_videos, 2);
  state.pending = [post("tiktok", 3, 19, 40)];
  const one = await runPostCheck(creator, { slot: 2, proven_id: "pv3" }, at());
  if (one.status !== 200) return assert.fail("expected 200");
  assert.deepEqual(one.body.found_for_slot, { tiktok_url: tt(3), views: 40 });
  assert.equal(one.body.today.tiktok, 3);
  assert.equal(one.body.today.instagram, 2);
  state.pending = [post("instagram", 3, 19, 2)];
  const both = await runPostCheck(creator, { slot: 2, proven_id: "pv3" }, at());
  if (both.status !== 200) return assert.fail("expected 200");
  assert.deepEqual(both.body.found_for_slot, { tiktok_url: tt(3), instagram_url: ig(3), views: 42 });
  assert.equal(both.body.today.posted_videos, 3);
  // Nobody else's posts were taken.
  assert.equal(state.attribution["0"].tiktok_url, tt(2));
  assert.equal(state.attribution["1"].tiktok_url, tt(1));
});

test("runPostCheck: day_complete only on the check that made the day count, and only once", async () => {
  const { state, deps } = memory({ posted: 4 });
  let t = NOW.getTime();
  const at = () => ({ ...deps, now: new Date((t += 31_000)) });
  const four = await runPostCheck(creator, { slot: 3 }, at());
  if (four.status !== 200) return assert.fail("expected 200");
  assert.equal(four.body.day_complete, null);
  assert.equal(four.body.today.counted, false);
  state.pending = [post("tiktok", 5, 21), post("instagram", 5, 21)];
  const fifth = await runPostCheck(creator, { slot: 4, proven_id: "pv5" }, at());
  if (fifth.status !== 200) return assert.fail("expected 200");
  assert.ok(fifth.body.day_complete);
  assert.equal(fifth.body.day_complete!.date, TODAY);
  assert.equal(fifth.body.today.counted, true);
  // Already counted: a later check never celebrates again.
  const later = await runPostCheck(creator, { slot: 4, proven_id: "pv5" }, at());
  if (later.status !== 200) return assert.fail("expected 200");
  assert.equal(later.body.day_complete, null);
});

test("runPostCheck: a day the web save already celebrated is not celebrated again", async () => {
  const { state, deps } = memory({ posted: 4 });
  state.celebrated.add(TODAY); // POST /api/creator/posting claimed it (e.g. a save raced the sync)
  state.pending = [post("tiktok", 5, 21), post("instagram", 5, 21)];
  const r = await runPostCheck(creator, { slot: 4 }, deps);
  if (r.status !== 200) return assert.fail("expected 200");
  assert.equal(r.body.today.counted, true);
  assert.equal(r.body.day_complete, null);
});

// ---------------------------------------------------------------- thumbnails

test("thumbnails parse from TikTok covers and Instagram image candidates", () => {
  assert.equal(tiktokThumb({ video: { cover: { url_list: ["https://p16.tiktokcdn.com/a.jpg"] } } }), "https://p16.tiktokcdn.com/a.jpg");
  assert.equal(tiktokThumb({ video: { cover: { url_list: [] }, origin_cover: { url_list: ["https://p16.tiktokcdn.com/o.jpg"] } } }), "https://p16.tiktokcdn.com/o.jpg");
  assert.equal(tiktokThumb({}), "");
  assert.equal(instagramThumb({ image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/x.jpg" }] } }), "https://scontent.cdninstagram.com/x.jpg");
  assert.equal(instagramThumb({ image_versions2: { candidates: [{ url: "javascript:alert(1)" }] } }), "");
  const ttPage = parseTikTokPage(
    { aweme_list: [{ aweme_id: "7421000000000000001", create_time: 1791400000, video: { cover: { url_list: ["https://p16.tiktokcdn.com/a.jpg"] } }, statistics: { play_count: 5 } }] },
    "jen",
  );
  assert.equal(ttPage.posts[0].thumbnail_url, "https://p16.tiktokcdn.com/a.jpg");
  const igPage = parseInstagramPage({ items: [{ media: { code: "DAbc001", taken_at: 1791400000, image_versions2: { candidates: [{ url: "https://scontent.cdninstagram.com/x.jpg" }] } } }] });
  assert.equal(igPage.posts[0].thumbnail_url, "https://scontent.cdninstagram.com/x.jpg");
  // No cover: the field is left out (Firestore never sees undefined).
  assert.equal("thumbnail_url" in parseInstagramPage({ items: [{ media: { code: "DAbc002", taken_at: 1791400000 } }] }).posts[0], false);
});
