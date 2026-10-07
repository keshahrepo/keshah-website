// Run: npx tsx --test lib/creators/proven-media.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { MEDIA_MAX_ATTEMPTS, SMALL_COVER_WIDTH, mirrorCover, needsCover, needsSmallCover, parseCoverUrls, resizeSmall } from "./proven-media";

const JPEG = Buffer.alloc(2000, 1);
const img = (type = "image/jpeg") => new Response(JPEG, { status: 200, headers: { "content-type": type } });

/** fetch stub: routes by URL prefix, records every call. */
function stub(routes: [string, () => Response][]) {
  const calls: string[] = [];
  const f = (async (input: RequestInfo | URL) => {
    const u = String(input);
    calls.push(u);
    const r = routes.find(([p]) => u.startsWith(p));
    return r ? r[1]() : new Response("nope", { status: 404 });
  }) as typeof fetch;
  return { f, calls };
}
const stored: { path: string; type: string }[] = [];
const store = async (path: string, _buf: Buffer, type: string) => {
  stored.push({ path, type });
  return `https://firebasestorage.googleapis.com/v0/b/x/o/${encodeURIComponent(path)}?alt=media&token=t`;
};

test("parseCoverUrls: TikTok prefers still non-HEIC covers, dynamic last", () => {
  const raw = {
    aweme_detail: {
      video: {
        cover: { url_list: ["https://p16.tiktokcdn.com/a.heic?x=1", "https://p16.tiktokcdn.com/a.jpeg?x=1"] },
        origin_cover: { url_list: ["https://p16.tiktokcdn.com/o.webp"] },
        dynamic_cover: { url_list: ["https://p16.tiktokcdn.com/d.webp"] },
      },
    },
  };
  assert.deepEqual(parseCoverUrls("tiktok", raw), [
    "https://p16.tiktokcdn.com/a.jpeg?x=1",
    "https://p16.tiktokcdn.com/o.webp",
    "https://p16.tiktokcdn.com/a.heic?x=1",
    "https://p16.tiktokcdn.com/d.webp",
  ]);
});

test("parseCoverUrls: Instagram display_url then thumbnail_src", () => {
  const raw = { data: { xdt_shortcode_media: { display_url: "https://scontent.cdninstagram.com/d.jpg", thumbnail_src: "https://scontent.cdninstagram.com/t.jpg" } } };
  assert.deepEqual(parseCoverUrls("instagram", raw), ["https://scontent.cdninstagram.com/d.jpg", "https://scontent.cdninstagram.com/t.jpg"]);
  assert.deepEqual(parseCoverUrls("instagram", {}), []);
});

test("needsCover: active videos without a mirrored cover, under the attempt cap", () => {
  const base = { status: "active" as const, source_url: "https://www.tiktok.com/@a/video/123456789", platform: "tiktok" as const, added_by: "seed" as const };
  assert.equal(needsCover(base), true);
  assert.equal(needsCover({ ...base, media: { thumbnail_url: "https://x" } }), false);
  assert.equal(needsCover({ ...base, media: { attempts: MEDIA_MAX_ATTEMPTS } }), false);
  assert.equal(needsCover({ ...base, status: "suggested" }), false);
  assert.equal(needsCover({ ...base, added_by: "founder_idea" }), false);
  assert.equal(needsCover({ ...base, source_url: null }), false);
});

test("mirrorCover: a still-valid stored URL costs nothing", async () => {
  const { f, calls } = stub([["https://old.cdn/", () => img()]]);
  const r = await mirrorCover("tiktok_1", { platform: "tiktok", source_url: "https://www.tiktok.com/@a/video/1", thumbnail_url: "https://old.cdn/c.jpg" }, { apiKey: "k", fetchImpl: f, store });
  assert.equal(r.ok, true);
  assert.equal(r.source, "stored");
  assert.equal(r.credits_used, 0);
  assert.deepEqual(calls, ["https://old.cdn/c.jpg"]);
  assert.match(r.thumbnail_url!, /firebasestorage.*proven_covers%2Ftiktok_1\.jpg/);
});

test("mirrorCover: TikTok falls back to oEmbed (free) before ScrapeCreators", async () => {
  const { f, calls } = stub([
    ["https://old.cdn/", () => new Response("expired", { status: 403 })],
    ["https://www.tiktok.com/oembed", () => Response.json({ thumbnail_url: "https://p16.tiktokcdn.com/oe.jpeg" })],
    ["https://p16.tiktokcdn.com/", () => img("image/webp")],
  ]);
  const r = await mirrorCover("tiktok_2", { platform: "tiktok", source_url: "https://www.tiktok.com/@a/video/2", thumbnail_url: "https://old.cdn/c.jpg" }, { apiKey: "k", fetchImpl: f, store });
  assert.equal(r.source, "oembed");
  assert.equal(r.credits_used, 0);
  assert.ok(!calls.some((c) => c.includes("scrapecreators")));
  assert.equal(stored[stored.length - 1].path, "proven_covers/tiktok_2.webp");
});

test("mirrorCover: Instagram uses one ScrapeCreators call; HEIC/non-images are skipped", async () => {
  const { f, calls } = stub([
    ["https://api.scrapecreators.com/v1/instagram/post", () => Response.json({ credits_remaining: 99, data: { xdt_shortcode_media: { display_url: "https://ig.cdn/heic", thumbnail_src: "https://ig.cdn/ok.jpg" } } })],
    ["https://ig.cdn/heic", () => img("image/heic")],
    ["https://ig.cdn/ok.jpg", () => img()],
  ]);
  const r = await mirrorCover("instagram_ABC", { platform: "instagram", source_url: "https://www.instagram.com/reel/ABC/" }, { apiKey: "k", fetchImpl: f, store });
  assert.equal(r.ok, true);
  assert.equal(r.source, "api");
  assert.equal(r.credits_used, 1);
  assert.equal(r.credits_remaining, 99);
  assert.equal(calls.filter((c) => c.includes("scrapecreators")).length, 1);
});

test("mirrorCover: deleted original reports an error, nothing stored", async () => {
  const before = stored.length;
  const { f } = stub([["https://api.scrapecreators.com/", () => new Response("not found", { status: 404 })]]);
  const r = await mirrorCover("instagram_GONE", { platform: "instagram", source_url: "https://www.instagram.com/reel/GONE/" }, { apiKey: "k", fetchImpl: f, store });
  assert.equal(r.ok, false);
  assert.equal(r.credits_used, 1);
  assert.match(r.error!, /HTTP 404/);
  assert.equal(stored.length, before);
});

test("resizeSmall: ~360px-wide JPEG from a full-size cover", async () => {
  const big = await sharp({ create: { width: 1080, height: 1920, channels: 3, background: { r: 40, g: 40, b: 40 } } }).png().toBuffer();
  const small = await resizeSmall(big);
  const meta = await sharp(small).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, SMALL_COVER_WIDTH);
  assert.equal(meta.height, 640);
  assert.ok(small.length < big.length);
});

test("needsSmallCover: mirrored active covers without a small one", () => {
  assert.equal(needsSmallCover({ status: "active", media: { thumbnail_url: "https://x/y.jpg" } }), true);
  assert.equal(needsSmallCover({ status: "active", media: { thumbnail_url: "https://x/y.jpg", thumb_small_url: "https://x/s.jpg" } }), false);
  assert.equal(needsSmallCover({ status: "active", media: {} }), false);
  assert.equal(needsSmallCover({ status: "active", media: { thumbnail_url: "https://x/y.jpg", small_attempts: MEDIA_MAX_ATTEMPTS } }), false);
});
