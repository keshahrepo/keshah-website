// Run: npx tsx --test lib/creators/content-schedule.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { contentDue } from "./content-schedule";

const at = (iso: string) => new Date(iso);
// 2026-10-17 is a Saturday; the coming Monday is 2026-10-19.

test("weekdays are idle without a request", () => {
  assert.equal(contentDue(at("2026-10-14T12:00:00Z"), {}), null);
});

test("manual request: true -> next Monday, Monday string -> that week, junk ignored", () => {
  assert.deepEqual(contentDue(at("2026-10-14T12:00:00Z"), { content_draft_requested: true }), { kind: "draft", week_of: "2026-10-19", manual: true });
  assert.deepEqual(contentDue(at("2026-10-14T12:00:00Z"), { content_draft_requested: "2026-10-12" }), { kind: "draft", week_of: "2026-10-12", manual: true });
  assert.equal(contentDue(at("2026-10-14T12:00:00Z"), { content_draft_requested: "2026-10-13" }), null);
});

test("Saturday drafts once the scan is done, or from 23:30 UTC regardless", () => {
  const sat = at("2026-10-17T21:00:00Z");
  assert.equal(contentDue(sat, { niche_scan_last: "2026-10-10" }), null);
  assert.equal(contentDue(sat, { niche_scan_last: "2026-10-17", niche_scan_active: "2026-10-17" }), null);
  assert.deepEqual(contentDue(sat, { niche_scan_last: "2026-10-17" }), { kind: "draft", week_of: "2026-10-19", manual: false });
  assert.deepEqual(contentDue(at("2026-10-17T23:30:00Z"), { niche_scan_active: "2026-10-17" }), { kind: "draft", week_of: "2026-10-19", manual: false });
});

test("drafted (or out of tries) weeks are not drafted again", () => {
  const sat = at("2026-10-17T23:40:00Z");
  assert.equal(contentDue(sat, { content_draft: { week: "2026-10-19", tries: 1, done: true, count: 10 } }), null);
  assert.equal(contentDue(sat, { content_draft: { week: "2026-10-19", tries: 3, done: false, count: 0 } }), null);
  assert.equal(contentDue(sat, { content_draft: { week: "2026-10-19", tries: 2, done: false } })?.kind, "draft");
  assert.equal(contentDue(sat, { content_draft: { week: "2026-10-12", tries: 1, done: true, count: 10 } })?.kind, "draft");
});

test("Sunday: catch-up draft first, then one push from 00:30 UTC when there are scripts", () => {
  const done = { content_draft: { week: "2026-10-19", tries: 1, done: true, count: 10 } };
  assert.equal(contentDue(at("2026-10-18T00:10:00Z"), {})?.kind, "draft");
  assert.equal(contentDue(at("2026-10-18T00:10:00Z"), done), null);
  assert.deepEqual(contentDue(at("2026-10-18T00:30:00Z"), done), { kind: "push", week_of: "2026-10-19" });
  assert.equal(contentDue(at("2026-10-18T09:00:00Z"), { ...done, content_pushed_week: "2026-10-19" }), null);
  assert.equal(contentDue(at("2026-10-18T09:00:00Z"), { content_draft: { week: "2026-10-19", tries: 3, done: false, count: 0 } }), null);
});
