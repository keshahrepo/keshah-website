// Run: npx tsx --test lib/creators/post-sync.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fetchRecentPosts, parseInstagramPage, parseTikTokPage, postKey, type ScrapedPost } from "./scrape";
import {
  ALERT_CREDIT_DAYS,
  DEEP_MAX_PAGES,
  DEEP_PAGES_GUESS,
  MAX_DAY_ROWS,
  SHALLOW_RUNS_PER_DAY,
  creditEstimate,
  deepStop,
  VIEWS_HISTORY_MAX,
  applyObservation,
  autoClaimId,
  bonusAction,
  bonusPushInfo,
  bucketByLocalDate,
  detectDay,
  detectedDays,
  followersPatch,
  mergeAutoVideos,
} from "./post-sync";
import { bonusLinesForMonth, monthSummary } from "./pay";
import { bonusPush } from "../push";
import type { BonusClaim, CreatorPost, PostingDay } from "./types";

const fixture = (name: string) => JSON.parse(readFileSync(join(__dirname, "__fixtures__", name), "utf8"));
const TT = fixture("tt_isai.json");
const IG = fixture("ig_isai.json");

// ---------------------------------------------------------------- parsing

test("TikTok page parses ids, canonical urls, views, pinned and paging", () => {
  const p = parseTikTokPage(TT, "@isai.trujillo01");
  assert.equal(p.posts.length, 10);
  assert.equal(p.posts.filter((x) => x.pinned).length, 3);
  assert.equal(p.has_more, true);
  assert.equal(p.cursor, "1790963357229");
  assert.equal(p.credits_remaining, 99);
  const v = p.posts.find((x) => x.post_id === "7693255888584346894")!;
  assert.equal(v.url, "https://www.tiktok.com/@isai.trujillo01/video/7693255888584346894");
  assert.equal(v.views, 1791);
  assert.equal(v.posted_at, new Date(1791225751 * 1000).toISOString());
  assert.equal(v.pinned, false);
  assert.match(v.caption, /try other methods/);
  // slideshow posts keep /photo/ urls
  assert.equal(p.posts.find((x) => x.post_id === "7611284030465527053")!.url, "https://www.tiktok.com/@isai.trujillo01/photo/7611284030465527053");
});

test("Instagram page parses shortcodes, reel urls, views, pinned and paging", () => {
  const p = parseInstagramPage(IG);
  assert.equal(p.posts.length, 12);
  assert.deepEqual(p.posts.filter((x) => x.pinned).map((x) => x.post_id), ["DdGBwigv_T8", "DVPIS5-jzt8"]);
  assert.equal(p.has_more, true);
  assert.ok(p.cursor && p.cursor.length > 20);
  assert.equal(p.credits_remaining, 98);
  const r = p.posts.find((x) => x.post_id === "DeH4Z70COxd")!;
  assert.equal(r.url, "https://www.instagram.com/reel/DeH4Z70COxd/");
  assert.equal(r.views, 2255);
  assert.equal(r.pinned, false);
});

test("parsers keep engagement counts and TikTok followers; absent fields stay absent", () => {
  const tt = parseTikTokPage(TT, "@isai.trujillo01");
  const v = tt.posts.find((x) => x.post_id === "7693255888584346894")!;
  assert.deepEqual([v.likes, v.comments, v.shares, v.saves], [143, 9, 4, 21]);
  const bare = tt.posts.find((x) => x.post_id === "7611284030465527053")!;
  for (const k of ["likes", "comments", "shares", "saves"]) assert.equal(k in bare, false);
  assert.equal(tt.followers, 48210);
  // another account's author block is not this creator's follower count
  const other = parseTikTokPage({ aweme_list: [{ aweme_id: "71", create_time: 1760000000, author: { unique_id: "someone", follower_count: 9 } }] }, "isai");
  assert.equal(other.followers, undefined);

  const ig = parseInstagramPage(IG);
  const r = ig.posts.find((x) => x.post_id === "DeH4Z70COxd")!;
  assert.equal(r.likes, 87);
  assert.equal(r.comments, 6);
  assert.equal("shares" in r, false);
  assert.equal("saves" in r, false);
  assert.equal(ig.followers, undefined);
});

test("followersPatch writes only platforms that reported a count", () => {
  assert.deepEqual(followersPatch({ tiktok: { followers: 500 }, instagram: {} }, "2026-10-01T00:00:00Z"), {
    "followers.tiktok": 500,
    "followers.at": "2026-10-01T00:00:00Z",
  });
  assert.deepEqual(followersPatch({ instagram: {} }, "2026-10-01T00:00:00Z"), {});
});

test("parsers tolerate junk", () => {
  assert.deepEqual(parseTikTokPage(null, "x").posts, []);
  assert.deepEqual(parseInstagramPage({ items: [{ media: {} }, 5] }).posts, []);
  assert.equal(parseInstagramPage({ items: [], paging_info: { more_available: true } }).has_more, false);
});

test("postKey matches manual link variants to the same post", () => {
  assert.equal(postKey("https://www.tiktok.com/@a/video/7693255888584346894?_r=1&u_code=x", "tiktok"), "tiktok:7693255888584346894");
  assert.equal(postKey("https://m.tiktok.com/v/7693255888584346894.html", "tiktok").startsWith("tiktok:"), true);
  assert.equal(postKey("https://www.instagram.com/reels/DeH4Z70COxd/?igsh=abc", "instagram"), "instagram:DeH4Z70COxd");
  assert.equal(postKey("https://instagram.com/p/DeH4Z70COxd", "instagram"), "instagram:DeH4Z70COxd");
  assert.equal(postKey("https://www.instagram.com/isai/reel/DeH4Z70COxd/", "instagram"), "instagram:DeH4Z70COxd");
});

// ---------------------------------------------------------------- bucketing / detection

const post = (platform: "tiktok" | "instagram", id: string, iso: string, extra: Partial<ScrapedPost> = {}): ScrapedPost => ({
  platform,
  post_id: id,
  url: platform === "tiktok" ? `https://www.tiktok.com/@h/video/${id}` : `https://www.instagram.com/reel/${id}/`,
  posted_at: iso,
  caption: "",
  views: 0,
  pinned: false,
  ...extra,
});

test("local-date bucketing near midnight: CET vs America/Los_Angeles", () => {
  const posts = [
    post("tiktok", "1000000001", "2026-10-05T22:30:00Z"), // Paris Oct 6 00:30 | LA Oct 5 15:30
    post("tiktok", "1000000002", "2026-10-06T06:30:00Z"), // Paris Oct 6 08:30 | LA Oct 5 23:30
    post("tiktok", "1000000003", "2026-10-06T07:05:00Z"), // Paris Oct 6 09:05 | LA Oct 6 00:05
    post("instagram", "Apinned", "2026-10-05T23:00:00Z", { pinned: true }),
  ];
  const paris = bucketByLocalDate(posts, "Europe/Paris");
  assert.deepEqual([...paris.keys()], ["2026-10-06"]);
  assert.equal(paris.get("2026-10-06")!.tiktok.length, 3);
  const la = bucketByLocalDate(posts, "America/Los_Angeles");
  assert.equal(la.get("2026-10-05")!.tiktok.length, 2);
  assert.equal(la.get("2026-10-06")!.tiktok.length, 1);
  // pinned posts are never bucketed
  assert.equal([...la.values()].reduce((s, b) => s + b.instagram.length, 0), 0);
});

test("Isai fixture: Mon Oct 5 (Chicago) = 5 TikToks + 5 Reels -> posted; Fri Oct 2 has only 2 TikToks on page 1", () => {
  const all = [...parseTikTokPage(TT, "isai.trujillo01").posts, ...parseInstagramPage(IG).posts];
  const b = bucketByLocalDate(all, "America/Chicago");
  assert.deepEqual(detectDay(b.get("2026-10-05")), { tiktok: 5, instagram: 5, posted: true });
  assert.deepEqual(detectDay(b.get("2026-10-02")), { tiktok: 2, instagram: 5, posted: false });
});

test("day detection: 4+5 and 5+4 are not enough, 5+5 counts", () => {
  const mk = (t: number, i: number) => ({
    tiktok: Array.from({ length: t }, (_, k) => post("tiktok", `20000000${k}`, "2026-10-05T15:00:00Z")),
    instagram: Array.from({ length: i }, (_, k) => post("instagram", `R${k}`, "2026-10-05T15:00:00Z")),
  });
  assert.equal(detectDay(mk(4, 5)).posted, false);
  assert.equal(detectDay(mk(5, 4)).posted, false);
  assert.equal(detectDay(mk(5, 5)).posted, true);
  assert.equal(detectDay(mk(7, 6)).posted, true);
  assert.equal(detectDay(undefined).posted, false);
});

test("detectedDays excludes pinned and weekends from posted", () => {
  const ps = [
    ...Array.from({ length: 5 }, (_, k) => ({ platform: "tiktok" as const, url: `https://www.tiktok.com/@h/video/30000000${k}`, posted_at: `2026-10-03T1${k}:00:00Z`, local_date: "2026-10-03", views: 10, pinned: false })),
    ...Array.from({ length: 5 }, (_, k) => ({ platform: "instagram" as const, url: `https://www.instagram.com/reel/S${k}/`, posted_at: `2026-10-03T1${k}:00:00Z`, local_date: "2026-10-03", views: 1, pinned: false })),
  ];
  const [d] = detectedDays(ps);
  assert.equal(d.weekday, false); // Saturday
  assert.equal(d.posted, false);
  assert.equal(d.views, 55);
  assert.equal(d.videos.length, 5);
  assert.equal(d.videos[0].tiktok_url, "https://www.tiktok.com/@h/video/300000000");
  assert.equal(d.videos[0].instagram_url, "https://www.instagram.com/reel/S0/");
});

// ---------------------------------------------------------------- merge

const tt = (n: number) => `https://www.tiktok.com/@h/video/${4000000000 + n}`;
const ig = (n: number) => `https://www.instagram.com/reel/C${n}/`;

test("merge: empty day becomes time-ordered pairs", () => {
  const { videos, added } = mergeAutoVideos([], [tt(1), tt(2), tt(3)], [ig(1), ig(2)]);
  assert.deepEqual(videos, [
    { tiktok_url: tt(1), instagram_url: ig(1) },
    { tiktok_url: tt(2), instagram_url: ig(2) },
    { tiktok_url: tt(3), instagram_url: "" },
  ]);
  assert.equal(added.length, 5);
});

test("merge: manual entries are never changed; auto fills gaps and skips duplicates", () => {
  const manual = [
    { tiktok_url: `${tt(1)}?_r=1`, instagram_url: "", inspired_by_url: "https://youtube.com/x" },
    { tiktok_url: "", instagram_url: "https://www.instagram.com/reels/C2/?igsh=zz" },
    { tiktok_url: "https://vm.tiktok.com/ZMabc/", instagram_url: "https://www.instagram.com/reel/MANUAL/" },
  ];
  const { videos, added } = mergeAutoVideos(manual, [tt(1), tt(2), tt(3)], [ig(1), ig(2), ig(3)]);
  // existing links untouched (same strings, same order, extra fields kept)
  assert.equal(videos[0].tiktok_url, `${tt(1)}?_r=1`);
  assert.equal(videos[0].inspired_by_url, "https://youtube.com/x");
  assert.equal(videos[1].instagram_url, "https://www.instagram.com/reels/C2/?igsh=zz");
  assert.equal(videos[2].tiktok_url, "https://vm.tiktok.com/ZMabc/");
  // gaps filled in time order with links not already present
  assert.equal(videos[0].instagram_url, ig(1));
  assert.equal(videos[1].tiktok_url, tt(2));
  // tt(1) and ig(2) were already there -> not duplicated; leftovers become a new row
  assert.deepEqual(videos[3], { tiktok_url: tt(3), instagram_url: ig(3) });
  assert.equal(videos.length, 4);
  assert.deepEqual(added.sort(), [ig(1), tt(2), tt(3), ig(3)].sort());
  // second run is a no-op
  assert.deepEqual(mergeAutoVideos(videos, [tt(1), tt(2), tt(3)], [ig(1), ig(2), ig(3)]).added, []);
});

test("merge never exceeds the row cap", () => {
  const many = Array.from({ length: 30 }, (_, i) => i);
  const { videos } = mergeAutoVideos([], many.map(tt), many.map(ig));
  assert.equal(videos.length, MAX_DAY_ROWS);
});

// ---------------------------------------------------------------- observations

const ctx = (nowIso: string) => ({ nowIso, timezone: "America/Chicago", handle: "h" });

test("applyObservation: history appended at most once per sync, capped; crossings set once", () => {
  const p = post("tiktok", "5000000001", "2026-10-01T15:00:00Z", { views: 50_000 });
  let r = applyObservation(null, p, ctx("2026-10-01T18:00:00Z"));
  assert.equal(r.local_date, "2026-10-01");
  assert.equal(r.first_seen_at, "2026-10-01T18:00:00Z");
  assert.deepEqual(r.views_history, [{ at: "2026-10-01T18:00:00Z", views: 50_000 }]);
  assert.equal(r.crossed_100k_at, null);
  // same sync instant -> no duplicate entry
  r = applyObservation(r, p, ctx("2026-10-01T18:00:00Z"));
  assert.equal(r.views_history.length, 1);
  // unchanged views, < 1 day later -> no entry
  r = applyObservation(r, p, ctx("2026-10-01T21:00:00Z"));
  assert.equal(r.views_history.length, 1);
  r = applyObservation(r, { ...p, views: 120_000 }, ctx("2026-10-02T00:00:00Z"));
  assert.equal(r.crossed_100k_at, "2026-10-02T00:00:00Z");
  assert.equal(r.first_seen_at, "2026-10-01T18:00:00Z");
  r = applyObservation(r, { ...p, views: 1_200_000 }, ctx("2026-10-03T00:00:00Z"));
  r = applyObservation(r, { ...p, views: 1_300_000 }, ctx("2026-10-04T00:00:00Z"));
  assert.equal(r.crossed_100k_at, "2026-10-02T00:00:00Z");
  assert.equal(r.crossed_1m_at, "2026-10-03T00:00:00Z");
  for (let i = 0; i < 100; i++) r = applyObservation(r, { ...p, views: 2_000_000 + i }, ctx(new Date(Date.parse("2026-10-05T00:00:00Z") + i * 3600e3).toISOString()));
  assert.equal(r.views_history.length, VIEWS_HISTORY_MAX);
  assert.equal(r.views_history.at(-1)!.views, 2_000_099);
});

test("applyObservation: engagement stored, snapshotted in history, never zeroed by a missing field", () => {
  const p = post("tiktok", "5000000002", "2026-10-01T15:00:00Z", { views: 1000, likes: 50, comments: 3, shares: 1, saves: 7 });
  let r = applyObservation(null, p, ctx("2026-10-01T18:00:00Z"));
  assert.deepEqual([r.likes, r.comments, r.shares, r.saves], [50, 3, 1, 7]);
  assert.deepEqual(r.views_history, [{ at: "2026-10-01T18:00:00Z", views: 1000, likes: 50, comments: 3, shares: 1, saves: 7 }]);
  // next response lacks saves/shares: keep the stored ones, update the rest
  r = applyObservation(r, { ...post("tiktok", "5000000002", "2026-10-01T15:00:00Z"), views: 2000, likes: 80, comments: 4 }, ctx("2026-10-01T21:00:00Z"));
  assert.deepEqual([r.likes, r.comments, r.shares, r.saves], [80, 4, 1, 7]);
  assert.deepEqual(r.views_history.at(-1), { at: "2026-10-01T21:00:00Z", views: 2000, likes: 80, comments: 4, shares: 1, saves: 7 });
  // a real 0 does overwrite
  r = applyObservation(r, { ...p, views: 2000, comments: 0 }, ctx("2026-10-01T22:00:00Z"));
  assert.equal(r.comments, 0);
  // never-seen engagement leaves no keys behind
  const bare = applyObservation(null, post("instagram", "DAbc", "2026-10-01T15:00:00Z", { views: 5 }), ctx("2026-10-01T18:00:00Z"));
  for (const k of ["likes", "comments", "shares", "saves"]) assert.equal(k in bare, false);
});

// ---------------------------------------------------------------- bonuses

const rec = (over: Partial<CreatorPost> = {}): CreatorPost => ({
  platform: "tiktok",
  post_id: "6000000001",
  url: "https://www.tiktok.com/@h/video/6000000001",
  handle: "h",
  posted_at: "2026-10-01T15:00:00Z",
  local_date: "2026-10-01",
  caption: "",
  views: 150_000,
  views_history: [],
  pinned: false,
  first_seen_at: "2026-10-01T18:00:00Z",
  last_synced_at: "2026-10-03T18:00:00Z",
  crossed_100k_at: "2026-10-03T18:00:00Z",
  crossed_1m_at: null,
  ...over,
});
const bctx = { startDate: "2026-09-15", timezone: "America/Chicago", nowIso: "2026-10-03T18:00:00Z" };

test("bonus: 100K inside 30 days creates one approved auto claim; re-run is a no-op; 1M upgrades it", () => {
  const a = bonusAction(rec(), [], bctx);
  assert.equal(a.op, "create");
  if (a.op !== "create") return;
  assert.equal(a.id, autoClaimId("tiktok", "6000000001"));
  assert.equal(a.claim.status, "approved");
  assert.equal(a.claim.source, "auto");
  assert.equal(a.claim.crossed_100k_on, "2026-10-03");
  assert.equal(a.claim.crossed_1m_on, undefined);
  assert.equal(a.claim.posted_on, "2026-10-01");
  const claims = [{ ...a.claim, id: a.id }];
  assert.equal(bonusAction(rec(), claims, bctx).op, "none");
  const up = bonusAction(rec({ views: 1_100_000, crossed_1m_at: "2026-10-20T03:00:00Z" }), claims, bctx);
  assert.equal(up.op, "upgrade");
  if (up.op !== "upgrade") return;
  assert.equal(up.patch.crossed_1m_on, "2026-10-19"); // 03:00Z = Oct 19 in Chicago
  const upgraded = [{ ...claims[0], ...up.patch }];
  assert.equal(bonusAction(rec({ views: 1_500_000, crossed_1m_at: "2026-10-20T03:00:00Z" }), upgraded, bctx).op, "none");
  // posted Oct 1, 100K Oct 3 + 1M Oct 19 -> one $100 line on the October invoice (both hit in October)
  assert.deepEqual(bonusLinesForMonth(upgraded, "2026-10").map((l) => [l.kind, l.amount_cents]), [["bonus_1m", 10000]]);
  assert.equal(bonusLinesForMonth(upgraded, "2026-11").length, 0);
});

test("bonus: 30-day window is day 30 inclusive, judged by first-observed local date", () => {
  assert.equal(bonusAction(rec({ crossed_100k_at: "2026-10-31T20:00:00Z" }), [], bctx).op, "create"); // day 30
  assert.equal(bonusAction(rec({ crossed_100k_at: "2026-11-01T20:00:00Z" }), [], bctx).op, "none"); // day 31
  // 1M after the window doesn't upgrade
  const a = bonusAction(rec(), [], bctx);
  assert.equal(a.op, "create");
  if (a.op !== "create") return;
  assert.equal(bonusAction(rec({ crossed_1m_at: "2026-11-05T12:00:00Z" }), [{ ...a.claim, id: a.id }], bctx).op, "none");
});

test("bonus: none before start_date, before pay starts, or under 100K", () => {
  assert.equal(bonusAction(rec({ local_date: "2026-09-10", posted_at: "2026-09-10T15:00:00Z" }), [], bctx).op, "none");
  assert.equal(bonusAction(rec(), [], { ...bctx, startDate: "" }).op, "none");
  assert.equal(bonusAction(rec({ views: 90_000, crossed_100k_at: null }), [], bctx).op, "none");
});

test("bonus: manual claim for the same video -> auto claim reuses its url and pays once; rejected -> left alone", () => {
  const manual: { id: string } & BonusClaim = {
    id: "m1",
    video_url: "https://www.tiktok.com/@h/video/6000000001?_r=1",
    platform: "tiktok",
    posted_on: "2026-10-01",
    crossed_100k_on: "2026-10-02",
    views_claimed: 110_000,
    status: "approved",
  };
  const a = bonusAction(rec(), [manual], bctx);
  assert.equal(a.op, "create");
  if (a.op !== "create") return;
  assert.equal(a.claim.video_url, manual.video_url);
  const lines = bonusLinesForMonth([manual, { ...a.claim, id: a.id }], "2026-10");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount_cents, 1500);
  assert.equal(bonusAction(rec(), [{ ...manual, status: "rejected" }], bctx).op, "none");
});

test("bonus push: +$15 at 100K, +$85 more at 1M, +$100 straight to 1M, on the payday after the month it was hit", () => {
  const a = bonusAction(rec(), [], bctx);
  assert.equal(a.op, "create");
  if (a.op !== "create") return;
  const first = bonusPushInfo(rec(), [], a.claim)!;
  assert.deepEqual([first.kind, first.addedCents, first.postId], ["100k", 1500, "tiktok_6000000001"]);
  const msg = bonusPush(first);
  assert.equal(msg.title, "Bonus added");
  assert.equal(msg.body, "Your video just passed 100K views. +$15 on your Nov 1 payout.");
  assert.deepEqual(msg.data, {
    type: "bonus",
    post_id: "tiktok_6000000001",
    platform: "tiktok",
    url: "https://www.tiktok.com/@h/video/6000000001",
    month: "2026-10",
    payout_month: "2026-11",
  });
  // The 1M upgrade adds the rest of the $100.
  const claims = [{ ...a.claim, id: a.id }];
  const big = rec({ views: 1_100_000, crossed_1m_at: "2026-10-20T03:00:00Z" });
  const up = bonusAction(big, claims, bctx);
  assert.equal(up.op, "upgrade");
  if (up.op !== "upgrade") return;
  const second = bonusPushInfo(big, claims, { ...claims[0], ...up.patch })!;
  assert.equal(bonusPush(second).body, "Your video just passed 1M views. +$85 on your Nov 1 payout.");
  // 1M passed in November (still inside the 30 days): the $85 is on the Dec 1 payout.
  const nov = rec({ views: 1_100_000, crossed_1m_at: "2026-10-31T20:00:00Z" });
  const upNov = bonusAction(nov, claims, bctx);
  if (upNov.op !== "upgrade") return assert.fail("expected upgrade");
  const novInfo = bonusPushInfo(nov, claims, { ...claims[0], ...upNov.patch, crossed_1m_on: "2026-11-02" })!;
  assert.equal(bonusPush(novInfo).body, "Your video just passed 1M views. +$85 on your Dec 1 payout.");
  assert.equal(bonusPush(novInfo).data?.payout_month, "2026-12");
  // Seen first at 1M: the whole $100 at once.
  const jump = rec({ views: 1_200_000, crossed_1m_at: "2026-10-03T18:00:00Z" });
  const j = bonusAction(jump, [], bctx);
  assert.equal(j.op, "create");
  if (j.op !== "create") return;
  assert.equal(bonusPush(bonusPushInfo(jump, [], j.claim)!).body, "Your video just passed 1M views. +$100 on your Nov 1 payout.");
  // A manual claim already paid the 100K: nothing new, no push.
  const manual: { id: string } & BonusClaim = {
    id: "m1",
    video_url: "https://www.tiktok.com/@h/video/6000000001?_r=1",
    platform: "tiktok",
    posted_on: "2026-10-01",
    crossed_100k_on: "2026-10-02",
    views_claimed: 110_000,
    status: "approved",
  };
  const m = bonusAction(rec(), [manual], bctx);
  if (m.op !== "create") return assert.fail("expected create");
  assert.equal(bonusPushInfo(rec(), [manual], m.claim), null);
  // A December video hitting 100K in January lands on the Feb 1 payout.
  assert.match(bonusPush({ ...first, postedOn: "2026-12-30", hitOn: "2027-01-02" }).body, /Feb 1 payout\.$/);
  // Old rule (posted before Oct 2026): two months after posting, whenever it was hit.
  assert.match(bonusPush({ ...first, postedOn: "2026-09-28", hitOn: "2026-10-02" }).body, /\+\$15 on your Nov 1 payout\.$/);
  assert.equal(bonusPush({ ...first, postedOn: "2026-09-28", hitOn: "2026-10-02" }).data?.payout_month, "2026-11");
});

// ---------------------------------------------------------------- double count guard

test("posted day + approved day off on the same date counts once (Isai Oct 2 / Oct 5)", () => {
  const vids = Array.from({ length: 5 }, (_, i) => ({ tiktok_url: tt(i), instagram_url: ig(i) }));
  const days: PostingDay[] = ["2026-10-01", "2026-10-02", "2026-10-05"].map((date) => ({ date, videos: vids, logged_at: `${date}T20:00:00Z` }));
  const off = [
    { date: "2026-10-02", status: "approved" as const },
    { date: "2026-10-05", status: "approved" as const },
  ];
  const s = monthSummary({ start_date: "2026-10-01", starting_completed_months: 0 }, "2026-10", days, off, [], [], { today: "2026-10-06" });
  assert.equal(s.postedDays, 3);
  assert.equal(s.approvedOffDays, 0);
  assert.equal(s.postedDays + s.approvedOffDays, 3);
  const offOnly = monthSummary({ start_date: "2026-10-01", starting_completed_months: 0 }, "2026-10", days.slice(0, 1), off, [], [], { today: "2026-10-06" });
  assert.equal(offOnly.postedDays + offOnly.approvedOffDays, 3);
  assert.equal(s.baseDueCents, offOnly.baseDueCents);
});

// ---------------------------------------------------------------- fetching

function mockFetch(pages: (unknown | Error | number)[]) {
  const calls: string[] = [];
  const f = (async (url: string) => {
    calls.push(String(url));
    const next = pages.shift();
    if (next instanceof Error) throw next;
    if (typeof next === "number") return new Response("nope", { status: next });
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

const ttPage = (ids: number[], createTime: number, more: boolean, cursor = "c") => ({
  success: true,
  credits_remaining: 777,
  has_more: more ? 1 : 0,
  max_cursor: cursor,
  aweme_list: ids.map((id) => ({ aweme_id: String(7000000000 + id), create_time: createTime, share_url: "", statistics: { play_count: 1 }, is_top: 0 })),
});

test("fetch: stops on page 1 when its oldest post is outside the window", async () => {
  const since = Date.parse("2026-09-01T00:00:00Z");
  const { f, calls } = mockFetch([ttPage([1, 2], since / 1000 - 10, true)]);
  const r = await fetchRecentPosts("tiktok", "h", { apiKey: "k", sinceMs: since, fetchImpl: f });
  assert.equal(calls.length, 1);
  assert.equal(r.posts.length, 2);
  assert.equal(r.credits_remaining, 777);
  assert.equal(r.truncated, false);
  assert.match(calls[0], /\/v3\/tiktok\/profile\/videos\?handle=h$/);
});

test("fetch: pages while inside the window, max 3 pages, flags truncation", async () => {
  const since = Date.parse("2026-09-01T00:00:00Z");
  const inside = since / 1000 + 1000;
  const { f, calls } = mockFetch([ttPage([1], inside, true, "c1"), ttPage([2], inside, true, "c2"), ttPage([3], inside, true, "c3")]);
  const r = await fetchRecentPosts("tiktok", "h", { apiKey: "k", sinceMs: since, fetchImpl: f });
  assert.equal(calls.length, 3);
  assert.match(calls[1], /max_cursor=c1/);
  assert.match(calls[2], /max_cursor=c2/);
  assert.equal(r.posts.length, 3);
  assert.equal(r.truncated, true);
});

test("fetch: retries once, then throws", async () => {
  const since = 0;
  const ok = mockFetch([new Error("socket hang up"), ttPage([1], 100, false)]);
  const r = await fetchRecentPosts("tiktok", "h", { apiKey: "k", sinceMs: since, fetchImpl: ok.f });
  assert.equal(r.posts.length, 1);
  assert.equal(r.calls, 2);
  const bad = mockFetch([500, 502]);
  await assert.rejects(fetchRecentPosts("instagram", "h", { apiKey: "k", sinceMs: since, fetchImpl: bad.f }), /HTTP 502/);
  assert.equal(bad.calls.length, 2);
  assert.match(bad.calls[0], /\/v1\/instagram\/user\/reels\?handle=h$/);
});

// ---------------------------------------------------------------- deep sync + credit math

test("deep stop rule: local date before (local today - 32 days)", () => {
  // now = Oct 6 02:00Z = Oct 5 in Los Angeles -> cutoff Sep 3 (LA); Oct 6 in Paris -> cutoff Sep 4
  const now = "2026-10-06T02:00:00Z";
  const p = (iso: string) => post("tiktok", "8000000001", iso);
  const la = deepStop(now, "America/Los_Angeles");
  assert.equal(la(p("2026-09-03T12:00:00Z")), false); // Sep 3 LA: still inside
  assert.equal(la(p("2026-09-03T06:00:00Z")), true); // Sep 2 23:00 LA
  const paris = deepStop(now, "Europe/Paris");
  assert.equal(paris(p("2026-09-03T12:00:00Z")), true); // Sep 3 < Sep 4
  assert.equal(paris(p("2026-09-03T22:30:00Z")), false); // Sep 4 00:30 Paris
});

test("deep fetch pages until a page's oldest post is beyond the cutoff", async () => {
  const now = "2026-10-06T12:00:00Z";
  const t = (iso: string) => Date.parse(iso) / 1000;
  const { f, calls } = mockFetch([
    ttPage([1, 2], t("2026-10-01T12:00:00Z"), true, "c1"),
    ttPage([3, 4], t("2026-09-10T12:00:00Z"), true, "c2"),
    ttPage([5, 6], t("2026-09-01T12:00:00Z"), true, "c3"), // older than Sep 4 cutoff -> stop after this page
    ttPage([7], t("2026-08-01T12:00:00Z"), true, "c4"),
  ]);
  const r = await fetchRecentPosts("tiktok", "h", { apiKey: "k", maxPages: DEEP_MAX_PAGES, isBeyond: deepStop(now, "America/Chicago"), fetchImpl: f });
  assert.equal(calls.length, 3);
  assert.equal(r.pages, 3);
  assert.equal(r.posts.length, 6);
  assert.equal(r.truncated, false);
});

test("deep fetch stops at the 20-page cap and flags truncation", async () => {
  const inside = Date.parse("2026-10-05T12:00:00Z") / 1000;
  const pages = Array.from({ length: 25 }, (_, i) => ttPage([i], inside, true, `c${i}`));
  const { f, calls } = mockFetch(pages);
  const r = await fetchRecentPosts("tiktok", "h", { apiKey: "k", maxPages: DEEP_MAX_PAGES, isBeyond: deepStop("2026-10-06T12:00:00Z", "UTC"), fetchImpl: f });
  assert.equal(calls.length, 20);
  assert.equal(r.truncated, true);
});

test("credit estimate: creators x 4 shallow x 2 + deep pages; alert under 7 days", () => {
  assert.equal(SHALLOW_RUNS_PER_DAY, 4);
  assert.equal(ALERT_CREDIT_DAYS, 7);
  const e = creditEstimate([31, 31, 20], 700);
  assert.equal(e.creators, 3);
  assert.equal(e.daily_credits, 3 * 8 + 82); // 106
  assert.equal(e.alert_below, 742);
  assert.equal(e.days_left, 6);
  assert.equal(e.low, true);
  assert.equal(creditEstimate([31, 31, 20], 800).low, false);
  assert.equal(creditEstimate([31, 31, 20], null).low, false);
  assert.equal(creditEstimate([], 10).low, false);
  // one creator at 5 videos/day with no deep run yet: 8 + 31 = 39/day
  assert.equal(creditEstimate([DEEP_PAGES_GUESS], 1000).daily_credits, 39);
});

test("bonusAction: bonus_start_date lets videos from before start_date earn", () => {
  const post = { platform: "tiktok", url: "https://www.tiktok.com/@h/video/1", post_id: "1", posted_at: "2026-09-20T12:00:00Z", local_date: "2026-09-20", views: 150000, pinned: false, crossed_100k_at: "2026-09-25T12:00:00Z", crossed_1m_at: null } as never;
  const ctx = { startDate: "2026-10-01", timezone: "UTC", nowIso: "2026-10-07T00:00:00Z" };
  assert.equal(bonusAction(post, [], ctx).op, "none");
  assert.equal(bonusAction(post, [], { ...ctx, bonusStartDate: "2026-09-01" }).op, "create");
});
