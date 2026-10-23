import { test } from "node:test";
import assert from "node:assert/strict";
import { byWeek, sumDays, viewsGainedByDay, weekStart, windowFor, type AccountDays } from "./installs-per-1k";

test("viewsGainedByDay: growth per day, new posts count in full, pinned skipped", () => {
  const m = viewsGainedByDay([
    // Old post, first seen when tracking began: only growth counts.
    { local_date: "2026-09-20", views_history: [{ at: "2026-10-06T18:00:00Z", views: 1000 }, { at: "2026-10-07T06:00:00Z", views: 1300 }, { at: "2026-10-07T18:00:00Z", views: 1500 }, { at: "2026-10-08T06:00:00Z", views: 1450 }] },
    // New post: its first snapshot's views are all new.
    { local_date: "2026-10-08", views_history: [{ at: "2026-10-08T10:00:00Z", views: 200 }, { at: "2026-10-09T10:00:00Z", views: 900 }] },
    { local_date: "2026-10-01", pinned: true, views_history: [{ at: "2026-10-07T00:00:00Z", views: 0 }, { at: "2026-10-08T00:00:00Z", views: 99999 }] },
  ]);
  assert.equal(m.get("2026-10-06"), undefined);
  assert.equal(m.get("2026-10-07"), 500);
  assert.equal(m.get("2026-10-08"), 200); // the old post dipped (ignored), the new post arrived
  assert.equal(m.get("2026-10-09"), 700);
});

const acct = (days: Record<string, [number, number]>): AccountDays => ({ id: "x", name: "X", isAadi: false, noTag: false, days });

test("sumDays: installs per 1,000 views over a window", () => {
  const a = acct({ "2026-10-07": [100000, 40], "2026-10-08": [300000, 80], "2026-10-09": [50000, 999] });
  assert.deepEqual(sumDays(a, "2026-10-07", "2026-10-08"), { views: 400000, installs: 120, per1k: 0.3 });
  assert.equal(sumDays(a, "2026-11-01", "2026-11-30").per1k, null);
});

test("byWeek groups Monday to Sunday", () => {
  assert.equal(weekStart("2026-10-11"), "2026-10-05"); // Sunday
  assert.equal(weekStart("2026-10-12"), "2026-10-12"); // Monday
  const w = byWeek([acct({ "2026-10-11": [1000, 1], "2026-10-12": [2000, 1] }), acct({ "2026-10-13": [2000, 2] })], "2026-10-01", "2026-10-31");
  assert.deepEqual(w.map((x) => [x.week, x.views, x.installs]), [["2026-10-05", 1000, 1], ["2026-10-12", 4000, 3]]);
});

test("windowFor clips to tracked days and yesterday", () => {
  const now = new Date("2026-10-23T12:00:00Z");
  assert.deepEqual(windowFor("all", now), { from: "2026-10-07", to: "2026-10-22" });
  assert.deepEqual(windowFor("2026-10", now), { from: "2026-10-07", to: "2026-10-22" });
  assert.equal(windowFor("2026-09", now), null);
  assert.deepEqual(windowFor("2026-11", new Date("2026-12-05T00:00:00Z")), { from: "2026-11-01", to: "2026-11-30" });
});
