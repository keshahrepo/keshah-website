// Run: npx tsx --test lib/creators/niche-scan.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_NICHE_ACCOUNTS,
  NICHE_QUERIES,
  NICHE_SCAN_DEFAULT_MAX_REQUESTS,
  accountOutliers,
  advanceNicheScan,
  isRelevant,
  median,
  newScanState,
  nicheScanDue,
  parseInstagramSearch,
  parseNicheAccounts,
  parseTiktokSearch,
  parseTiktokTop,
  pickForEnrichment,
  rankNicheVideos,
  type NicheVideo,
} from "./niche-scan";
import { parseTranscript, type ScrapedPost } from "./scrape";

const q = { platform: "tiktok" as const, source: "keyword" as const, niche: "posture", query: "posture test" };
const base: NicheVideo = { platform: "tiktok", source: "keyword", niche: "x", query: "y", url: "", handle: "h", views: 0, likes: 0, comments: 0, shares: 0, caption: "", posted_at: null };

test("about 80 searches, all three sources, plus ~40 default accounts, all inside the cap", () => {
  assert.ok(NICHE_QUERIES.length >= 75 && NICHE_QUERIES.length <= 85);
  for (const s of ["keyword", "top", "reels"]) assert.ok(NICHE_QUERIES.some((x) => x.source === s));
  assert.ok(DEFAULT_NICHE_ACCOUNTS.length >= 35 && DEFAULT_NICHE_ACCOUNTS.length <= 45);
  assert.ok(NICHE_QUERIES.length + DEFAULT_NICHE_ACCOUNTS.length + 40 <= NICHE_SCAN_DEFAULT_MAX_REQUESTS);
  for (const noisy of ["pinch test", "try this test", "face asymmetry test", "skin test", "if you can't do this"]) assert.ok(!NICHE_QUERIES.some((x) => x.query === noisy), noisy);
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
  assert.equal(v[0].source, "keyword");
  assert.equal(v[0].posted_at, new Date(1760000000 * 1000).toISOString());
});

test("parses TikTok top search items (ISO create_time, url, jpeg cover over heic)", () => {
  const d = {
    success: true,
    items: [
      {
        id: "7620673421353012494",
        desc: "neck hump fix",
        content_type: "video",
        create_time: "2026-03-24T04:25:45.000Z",
        url: "https://www.tiktok.com/@idk/video/7620673421353012494",
        author: { unique_id: "idk" },
        statistics: { play_count: 2674660, digg_count: 570679, comment_count: 2555, share_count: 146329 },
        video: { cover: { url_list: ["https://p16.x/a.heic?s=1", "https://p16.x/a.jpeg?s=1"] } },
      },
    ],
  };
  const v = parseTiktokTop(d, { ...q, source: "top" });
  assert.equal(v[0].url, "https://www.tiktok.com/@idk/video/7620673421353012494");
  assert.equal(v[0].posted_at, "2026-03-24T04:25:45.000Z");
  assert.equal(v[0].views, 2674660);
  assert.equal(v[0].cover, "https://p16.x/a.jpeg?s=1");
  assert.deepEqual(parseTiktokTop({ search_item_list: [] }, q), []);
});

test("parses Instagram reel search defensively, including ISO taken_at", () => {
  const ig = { ...q, platform: "instagram" as const, source: "reels" as const };
  const v = parseInstagramSearch({ reels: [{ shortcode: "ABC", caption: { text: "hi" }, owner: { username: "b" }, like_count: 10, taken_at: 1760000000 }] }, ig);
  assert.equal(v[0].url, "https://www.instagram.com/reel/ABC/");
  assert.equal(v[0].caption, "hi");
  assert.equal(v[0].views, 0);
  const w = parseInstagramSearch({ reels: [{ shortcode: "D", url: "https://www.instagram.com/reel/D/", caption: "x", taken_at: "2025-09-16T16:56:45.000Z", like_count: 3487, thumbnail_src: "https://cdn/x.jpg" }] }, ig);
  assert.equal(w[0].posted_at, "2025-09-16T16:56:45.000Z");
  assert.equal(w[0].cover, "https://cdn/x.jpg");
  assert.deepEqual(parseInstagramSearch({ nope: 1 }, q), []);
});

test("transcript parsers match the documented shapes", () => {
  // GET /v1/tiktok/video/transcript -> { transcript: "WEBVTT ..." }
  const tt = { success: true, credits_remaining: 1000000, id: "7499229683859426602", url: "https://www.tiktok.com/@s/video/7499229683859426602", transcript: "WEBVTT\n\n00:00:00.120 --> 00:00:01.840\nAlright, pizza review time.\n\n00:00:01.840 --> 00:00:03.000\nOne bite." };
  assert.equal(parseTranscript("tiktok", tt), "Alright, pizza review time. One bite.");
  // GET /v2/instagram/media/transcript -> { transcripts: [{ text }] }
  const ig = { success: true, transcripts: [{ id: "1", shortcode: "DHsD6HGqJhp", text: "transcript text here", duration_seconds: 45 }] };
  assert.equal(parseTranscript("instagram", ig), "transcript text here");
  assert.equal(parseTranscript("tiktok", {}), "");
});

test("noise filter keeps on-niche captions and drops the first scan's noise", () => {
  // Real captions from the first scan.
  assert.equal(isRelevant("Can you pinch your scalp right above your ears? 🤏 If you can’t grab it easily", "hair"), true);
  assert.equal(isRelevant("the truth about minoxidil 👀 #hairloss #hairgrowth", "hair"), true);
  assert.equal(isRelevant("Probably the tiniest scap I have ever picked #fyp #scalp #asmr #pickingscalp", "hair"), false);
  assert.equal(isRelevant("The ticks are so bad this year 😩 Midwest things", "hair"), false);
  assert.equal(isRelevant("😭 #pimple #girls #women #hospital #surgery", "hair"), false);
  assert.equal(isRelevant("Say goodbye to neck hump 🎥 Video by Dr. Rodion", "posture"), true);
  assert.equal(isRelevant("POV:you learn the Black Dragon spin in one simple tutorial #kungfu", "posture"), false);
  assert.equal(isRelevant("Mask filter for face Asymmetry vs Symmetry #capcut", "face"), false);
  assert.equal(isRelevant("4 Face Yoga Exercises 🎯 Do it with me!", "face"), true);
  assert.equal(isRelevant("Can you get up off the floor without using your hands? This test predicts longevity.", "tests"), true);
  assert.equal(isRelevant("“You can’t even do it” #ogfortnite #fortnitemove", "tests"), false);
  assert.equal(isRelevant("I bet you can't do this #couplecomedy", "tests"), false);
  assert.equal(isRelevant("menopause tips", "men"), false);
  assert.equal(isRelevant("\"Looksmaxxing\" influencer Braden Peters, also known as Clavicular, has been charged", "men"), false);
  assert.equal(isRelevant("tried and true hope this helps :)) #yogatok #techneck", "posture"), true);
  assert.equal(isRelevant("3 habits every men's health doctor wants you to drop", "men"), true);
  assert.equal(isRelevant("", "hair"), false);
  assert.equal(isRelevant("", "hair", { allowEmpty: true }), true);
});

test("account outliers: last 14 days and >= 3x the page median (pinned ignored) or >= 1M", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  const day = (n: number) => new Date(now.getTime() - n * 86400_000).toISOString();
  const p = (id: string, views: number, ago: number, pinned = false): ScrapedPost => ({ platform: "tiktok", post_id: id, url: `u${id}`, posted_at: day(ago), caption: "neck", views, pinned });
  const posts = [p("1", 10_000, 1), p("2", 12_000, 2), p("3", 9_000, 3), p("4", 40_000, 4), p("5", 1_200_000, 30), p("6", 50_000_000, 400, true), p("7", 11_000, 5)];
  assert.equal(median([10_000, 12_000, 9_000, 40_000, 1_200_000, 11_000]), 11_500);
  const out = accountOutliers(posts, { platform: "tiktok", handle: "drrodpt", niche: "posture" }, now);
  assert.deepEqual(out.map((v) => v.url), ["u4"]); // u5 is too old, u6 is pinned
  assert.equal(out[0].source, "account");
  assert.equal(out[0].median_views, 11_500);
  assert.equal(out[0].ratio, 3.5);
  const big = accountOutliers([p("8", 1_000_000, 2), p("9", 900_000, 2), p("10", 950_000, 2)], { platform: "tiktok", handle: "x", niche: "hair" }, now);
  assert.deepEqual(big.map((v) => v.url), ["u8"]);
  assert.deepEqual(accountOutliers([], { platform: "tiktok", handle: "x", niche: "hair" }, now), []);
});

test("niche_accounts setting: cleaned and deduped, default when empty", () => {
  assert.equal(parseNicheAccounts(undefined), DEFAULT_NICHE_ACCOUNTS);
  assert.equal(parseNicheAccounts([{ platform: "x", handle: "a" }]), DEFAULT_NICHE_ACCOUNTS);
  assert.deepEqual(parseNicheAccounts([{ platform: "tiktok", handle: "@DrRodPT", niche: "posture" }, { platform: "tiktok", handle: "drrodpt" }, { platform: "instagram", handle: "a b" }]), [{ platform: "tiktok", handle: "drrodpt", niche: "posture" }]);
});

test("rank dedupes by URL, ranks like-only reels by estimated views, keeps enrichment", () => {
  const r = rankNicheVideos([
    { ...base, url: "u1", views: 10, likes: 1 },
    { ...base, url: "u2", views: 50, likes: 1 },
    { ...base, url: "u1", views: 20, likes: 1 },
    { ...base, url: "u3", views: 0, likes: 3, platform: "instagram" },
  ]);
  assert.deepEqual(r.map((x) => [x.url, x.views]), [["u3", 0], ["u2", 50], ["u1", 20]]);
  const e = rankNicheVideos([{ ...base, url: "a", views: 5, transcript: "hi" }, { ...base, url: "a", views: 9 }]);
  assert.equal(e[0].views, 9);
  assert.equal(e[0].transcript, "hi");
});

test("enrichment picks reserve hair slots, then account outliers, then keyword hits", () => {
  const mk = (p: string, n: number) => Array.from({ length: n }, (_, i) => ({ ...base, url: `${p}${i}`, views: 1000 - i }));
  const picks = pickForEnrichment({ hair: mk("h", 20), accounts: mk("a", 5), videos: mk("v", 50) }, 40, 10);
  assert.equal(picks.length, 40);
  assert.deepEqual(picks.slice(0, 12), ["h0", "h1", "h2", "h3", "h4", "h5", "h6", "h7", "h8", "h9", "a0", "a1"]);
  assert.equal(picks[15], "v0");
});

test("schedule: Saturday from 20:00 UTC once per weekend, Sunday catch-up, or on request", () => {
  const sat = new Date("2026-10-17T20:05:00Z");
  assert.equal(nicheScanDue({ now: sat, requested: false, last: "2026-10-10" }), true);
  assert.equal(nicheScanDue({ now: sat, requested: false, last: null }), true);
  assert.equal(nicheScanDue({ now: sat, requested: false, last: "2026-10-17" }), false);
  assert.equal(nicheScanDue({ now: new Date("2026-10-17T19:59:00Z"), requested: false, last: "2026-10-10" }), false);
  assert.equal(nicheScanDue({ now: new Date("2026-10-18T03:00:00Z"), requested: false, last: "2026-10-10" }), true);
  assert.equal(nicheScanDue({ now: new Date("2026-10-18T03:00:00Z"), requested: false, last: "2026-10-17" }), false);
  assert.equal(nicheScanDue({ now: new Date("2026-10-19T13:00:00Z"), requested: false, last: "2026-10-10" }), false);
  assert.equal(nicheScanDue({ now: new Date("2026-10-15T15:00:00Z"), requested: true, last: "2026-10-10" }), true);
});

/** fetch stub for ScrapeCreators: routes by path, counts calls. */
function stubApi() {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(u);
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
    if (u.includes("/v1/tiktok/search/keyword")) return json({ credits_remaining: 900, search_item_list: [{ aweme_info: { aweme_id: "7499229683859426602", desc: "#hairloss scalp test", create_time: 1760000000, author: { unique_id: "a" }, statistics: { play_count: 2_000_000 } } }, { aweme_info: { aweme_id: "2", desc: "#asmr #scalp picking", create_time: 1760000000, author: { unique_id: "b" }, statistics: { play_count: 9_000_000 } } }] });
    if (u.includes("/v1/tiktok/search/top")) return json({ credits_remaining: 899, items: [] });
    if (u.includes("/v2/instagram/reels/search")) return json({ reels: [] });
    if (u.includes("/v3/tiktok/profile/videos")) return json({ aweme_list: [] });
    if (u.includes("/v1/instagram/user/reels")) return json({ items: [] });
    if (u.includes("/v1/tiktok/video/transcript")) return json({ credits_remaining: 850, transcript: "WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nPinch your scalp." });
    return new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}

test("a scan runs in resumable chunks, filters noise, enriches, and respects the cap", async () => {
  const { f, calls } = stubApi();
  const now = new Date("2026-10-17T20:00:00Z");
  const deps = { apiKey: "k", now, fetchImpl: f, scanId: "2026-10-17", mirrorCover: async (path: string) => `https://store/${path}` };
  let s = newScanState(now, { niche_accounts: [{ platform: "tiktok", handle: "drrodpt", niche: "posture" }] });
  assert.equal(s.max_requests, 400);
  s = await advanceNicheScan(s, { ...deps, deadlineMs: Date.now() - 1 }); // no time: nothing done
  assert.equal(s.next, 0);
  assert.equal(s.status, "running");
  s = await advanceNicheScan(s, { ...deps, deadlineMs: Date.now() + 60_000 });
  assert.equal(s.status, "done");
  assert.equal(s.next, NICHE_QUERIES.length + 1);
  assert.deepEqual(s.videos.map((v) => v.url), ["https://www.tiktok.com/@a/video/7499229683859426602"]);
  assert.equal(s.hair.length, 1);
  assert.equal(s.videos[0].transcript, "Pinch your scalp.");
  assert.match(s.videos[0].cover_mirror ?? "", /^https:\/\/store\/niche_covers\/2026-10-17\/tiktok_7499229683859426602$/);
  assert.equal(s.hair[0].transcript, "Pinch your scalp.");
  assert.equal(s.requests, calls.length);
  assert.equal(s.credits_remaining, 850);

  const capped = await advanceNicheScan(newScanState(now, { niche_scan_max_requests: 50 }), { ...deps, deadlineMs: Date.now() + 60_000 });
  assert.ok(capped.requests <= 50, String(capped.requests));
  assert.equal(capped.status, "done");
});
