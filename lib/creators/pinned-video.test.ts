import assert from "node:assert/strict";
import test from "node:test";
import { day1PinnedCounts, onPinnedDay1, pinnedOf } from "./pinned-video";

test("pinnedOf: a stored pinned video, or null when missing or broken", () => {
  assert.equal(pinnedOf(undefined), null);
  assert.equal(pinnedOf({}), null);
  assert.equal(pinnedOf({ pinned_video: { status: "submitted" } }), null); // no upload path
  assert.equal(pinnedOf({ pinned_video: { status: "requested", requested_day: "2026-10-15" } })?.status, "requested"); // asked for, nothing uploaded
  const p = { status: "submitted", path: "creators/x/pinned/abc.mp4", submitted_at: "2026-10-14T10:00:00Z", counted_day: "2026-10-14" };
  assert.deepEqual(pinnedOf({ pinned_video: p }), p);
});

test("onPinnedDay1: new creators with no pinned video, or a no-upload one not counted yet", () => {
  assert.equal(onPinnedDay1(false, null), true);
  assert.equal(onPinnedDay1(false, { status: "approved", path: "", submitted_at: "", no_upload: true }), true);
  assert.equal(onPinnedDay1(false, { status: "approved", path: "", submitted_at: "", no_upload: true, counted_day: "2026-10-28" }), false);
  assert.equal(onPinnedDay1(false, { status: "requested", path: "", submitted_at: "" }), false); // founder redo keeps the upload
  assert.equal(onPinnedDay1(true, null), false);
});

test("day1PinnedCounts: pinned posts posted that day, up to 2 per app", () => {
  const d = "2026-10-28";
  const posts = [
    { platform: "tiktok", pinned: true, local_date: d },
    { platform: "tiktok", pinned: true, local_date: d },
    { platform: "tiktok", pinned: true, local_date: d },
    { platform: "tiktok", pinned: false, local_date: d },
    { platform: "instagram", pinned: true, local_date: d },
    { platform: "instagram", pinned: true, local_date: "2026-10-01" }, // an old pinned post
  ];
  assert.deepEqual(day1PinnedCounts(posts, d), { tiktok: 2, instagram: 1 });
});
