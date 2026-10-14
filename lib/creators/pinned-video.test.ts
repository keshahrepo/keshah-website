import assert from "node:assert/strict";
import test from "node:test";
import { pinnedOf } from "./pinned-video";

test("pinnedOf: a stored pinned video, or null when missing or broken", () => {
  assert.equal(pinnedOf(undefined), null);
  assert.equal(pinnedOf({}), null);
  assert.equal(pinnedOf({ pinned_video: { status: "submitted" } }), null); // no upload path
  const p = { status: "submitted", path: "creators/x/pinned/abc.mp4", submitted_at: "2026-10-14T10:00:00Z", counted_day: "2026-10-14" };
  assert.deepEqual(pinnedOf({ pinned_video: p }), p);
});
