// Run: npx tsx --test lib/interview-auto.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  autoEnsureDue,
  autoSessionSlug,
  autoSessionSlugWithYear,
  autoSessionTitle,
  missingSessionStarts,
  sameSlot,
} from "./interview-auto";

const MIN = 60_000;
// Thu Oct 15 2026, 6:00 PM EDT
const THU_6PM = Date.parse("2026-10-15T22:00:00.000Z");

test("slug is deterministic, in Eastern, and drops :00", () => {
  assert.equal(autoSessionSlug(THU_6PM), "oct-15-6pm");
  assert.equal(autoSessionSlug(THU_6PM), autoSessionSlug(Date.parse("2026-10-15T22:00:00.000000Z")));
  assert.equal(autoSessionSlug(THU_6PM + 30 * MIN), "oct-15-630pm");
  assert.equal(autoSessionSlug(Date.parse("2026-10-15T15:00:00Z")), "oct-15-11am");
  assert.equal(autoSessionSlug(Date.parse("2026-10-15T16:00:00Z")), "oct-15-12pm");
  // 1 AM UTC on the 16th is still the 15th in Eastern
  assert.equal(autoSessionSlug(Date.parse("2026-10-16T01:00:00Z")), "oct-15-9pm");
  // Winter (EST, UTC-5)
  assert.equal(autoSessionSlug(Date.parse("2026-12-03T23:00:00Z")), "dec-3-6pm");
  assert.equal(autoSessionSlugWithYear(THU_6PM), "oct-15-6pm-2026");
});

test("title reads like a person wrote it, no em dashes", () => {
  assert.equal(autoSessionTitle(THU_6PM), "Group interview · Thu Oct 15, 6:00 PM ET");
  assert.equal(autoSessionTitle(THU_6PM + 30 * MIN), "Group interview · Thu Oct 15, 6:30 PM ET");
  assert.ok(!autoSessionTitle(THU_6PM).includes("—"));
});

test("sameSlot is ±30 min", () => {
  assert.ok(sameSlot(THU_6PM, THU_6PM + 30 * MIN));
  assert.ok(sameSlot(THU_6PM, THU_6PM - 30 * MIN));
  assert.ok(!sameSlot(THU_6PM, THU_6PM + 31 * MIN));
  assert.ok(!sameSlot(0, THU_6PM));
});

test("missingSessionStarts: one per distinct time, skips covered slots", () => {
  const iso = (ms: number) => new Date(ms).toISOString();
  const fri = THU_6PM + 24 * 60 * MIN;
  // Three people at Thu 6pm (two string formats), one Fri 6pm, junk ignored.
  const bookings = [iso(THU_6PM), "2026-10-15T22:00:00.000000Z", iso(THU_6PM), iso(fri), null, "", "nope"];
  assert.deepEqual(missingSessionStarts(bookings, []), [THU_6PM, fri]);
  // A session made by hand at 6:15 covers the 6pm slot.
  assert.deepEqual(missingSessionStarts(bookings, [THU_6PM + 15 * MIN]), [fri]);
  assert.deepEqual(missingSessionStarts(bookings, [THU_6PM, fri]), []);
  // Bookings 10 min apart share one session.
  assert.deepEqual(missingSessionStarts([iso(THU_6PM), iso(THU_6PM + 10 * MIN)], []), [THU_6PM]);
});

test("autoEnsureDue: every 5 minutes", () => {
  assert.ok(autoEnsureDue(Date.parse("2026-10-15T22:00:10Z")));
  assert.ok(autoEnsureDue(Date.parse("2026-10-15T22:35:59Z")));
  assert.ok(!autoEnsureDue(Date.parse("2026-10-15T22:01:00Z")));
  let n = 0;
  for (let m = 0; m < 60; m++) if (autoEnsureDue(Date.parse("2026-10-15T22:00:00Z") + m * MIN)) n++;
  assert.equal(n, 12);
});
