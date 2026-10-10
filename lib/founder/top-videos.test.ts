// Run: npx tsx --test lib/founder/top-videos.test.ts
// Founder top videos: TikTok + Instagram pairing per day (same as the creator app), bonus from approved claims, ranking.
import { test } from "node:test";
import assert from "node:assert/strict";
import { bonusByPost, pairVideos, topByViews, type PostLite } from "./top-videos";
import type { BonusClaim } from "@/lib/creators/types";

const tt = (id: string, views: number, at: string, day = at.slice(0, 10)): PostLite => ({
  platform: "tiktok", url: `https://www.tiktok.com/@a/video/${id}`, views, postedAt: at, localDate: day, thumbnail: `t${id}`,
});
const ig = (id: string, views: number, at: string, day = at.slice(0, 10)): PostLite => ({
  platform: "instagram", url: `https://www.instagram.com/reel/${id}/`, views, postedAt: at, localDate: day, thumbnail: null,
});

test("same count of TikToks and Instagram posts on a day pair up in posting order", () => {
  const v = pairVideos([
    tt("1000000001", 100, "2026-10-01T10:00:00Z"),
    tt("1000000002", 50, "2026-10-01T12:00:00Z"),
    ig("B", 7, "2026-10-01T12:05:00Z"),
    ig("A", 3, "2026-10-01T10:05:00Z"),
  ]);
  assert.equal(v.length, 2);
  const first = v.find((x) => x.tiktok?.views === 100)!;
  assert.equal(first.instagram?.views, 3);
  assert.equal(first.views, 103);
  assert.equal(first.thumbnail, "t1000000001");
});

test("uneven days don't pair: every post is its own video", () => {
  const v = pairVideos([tt("1000000001", 10, "2026-10-02T10:00:00Z"), tt("1000000002", 20, "2026-10-02T11:00:00Z"), ig("A", 5, "2026-10-02T10:00:00Z")]);
  assert.equal(v.length, 3);
  assert.ok(v.every((x) => !(x.tiktok && x.instagram)));
});

test("different days never pair", () => {
  const v = pairVideos([tt("1000000001", 10, "2026-10-02T10:00:00Z"), ig("A", 5, "2026-10-03T10:00:00Z")]);
  assert.equal(v.length, 2);
});

test("bonus comes from approved claims at their final level, added across platforms", () => {
  const claims: BonusClaim[] = [
    { video_url: "https://www.tiktok.com/@a/video/1000000001?x=1", platform: "tiktok", posted_on: "2026-10-01", crossed_100k_on: "2026-10-03", crossed_1m_on: "2026-10-09", views_claimed: 1, status: "approved" },
    { video_url: "https://www.instagram.com/reel/A", platform: "instagram", posted_on: "2026-10-01", crossed_100k_on: "2026-10-05", views_claimed: 1, status: "approved" },
    { video_url: "https://www.tiktok.com/@a/video/1000000002", platform: "tiktok", posted_on: "2026-10-01", crossed_100k_on: "2026-10-05", views_claimed: 1, status: "claimed" },
    { video_url: "https://www.tiktok.com/@a/video/1000000003", platform: "tiktok", posted_on: "2026-09-01", crossed_100k_on: "2026-10-05", views_claimed: 1, status: "approved" },
  ];
  const b = bonusByPost(claims);
  const v = pairVideos([tt("1000000001", 2_000_000, "2026-10-01T10:00:00Z"), ig("A", 150_000, "2026-10-01T10:05:00Z"), tt("1000000002", 120_000, "2026-10-02T10:00:00Z"), tt("1000000003", 120_000, "2026-09-01T10:00:00Z")], b);
  const pair = v.find((x) => x.tiktok?.views === 2_000_000)!;
  assert.equal(pair.bonusCents, 10000 + 1500);
  assert.equal(v.find((x) => x.postedOn === "2026-10-02")!.bonusCents, 0); // not approved yet
  assert.equal(v.find((x) => x.postedOn === "2026-09-01")!.bonusCents, 0); // crossed after 30 days
});

test("top 5 by views, zero-view videos left out", () => {
  const v = pairVideos([
    ...[1, 2, 3, 4, 5, 6].map((k) => tt(`10000000${k}0`, k * 10, `2026-10-0${k}T10:00:00Z`)),
    tt("1000000099", 0, "2026-10-07T10:00:00Z"),
  ]);
  const top = topByViews(v);
  assert.deepEqual(top.map((x) => x.views), [60, 50, 40, 30, 20]);
});
