import { test } from "node:test";
import assert from "node:assert/strict";
import { judge, organicResult, per1kResult, windows, type TestDoc } from "./tests";
import type { AccountDays } from "./installs-per-1k";

const now = new Date("2026-11-10T12:00:00Z");
const base: TestDoc = { title: "t", area: "content", metric: "per1k", scope: "isai", started_on: "2026-10-27", window_days: 7 };

test("windows: equal before and after, clipped to yesterday", () => {
  assert.deepEqual(windows(base, now), { n: 7, before: { from: "2026-10-20", to: "2026-10-26" }, after: { from: "2026-10-27", to: "2026-11-02" } });
  const early = windows(base, new Date("2026-10-29T12:00:00Z"));
  assert.deepEqual(early.after, { from: "2026-10-27", to: "2026-10-28" });
  assert.equal(windows(base, new Date("2026-10-27T08:00:00Z")).after, null);
});

test("judge: 15% rule, too early without enough data, lower-is-better flips", () => {
  assert.equal(judge(0.14, 0.38, true).verdict, "better");
  assert.equal(judge(0.4, 0.3, true).verdict, "worse");
  assert.equal(judge(0.4, 0.43, true).verdict, "no_change");
  assert.equal(judge(0.14, 0.38, false).verdict, "too_early");
  assert.equal(judge(10, 7, true, false).verdict, "better");
});

test("per1kResult: same creator, before vs after, needs 1M views a side", () => {
  const days: Record<string, [number, number]> = {};
  for (let d = 20; d <= 26; d++) days[`2026-10-${d}`] = [700000, 98]; // 0.14
  for (let d = 27; d <= 31; d++) days[`2026-10-${d}`] = [300000, 114]; // 0.38
  for (let d = 1; d <= 2; d++) days[`2026-11-0${d}`] = [300000, 114];
  const a: AccountDays = { id: "isai", name: "Isai", isAadi: false, noTag: false, days };
  const r = per1kResult([a], base, now);
  assert.equal(r.verdict, "better");
  assert.ok(Math.abs((r.before!.value ?? 0) - 0.14) < 1e-9 && Math.abs((r.after!.value ?? 0) - 0.38) < 1e-9);
  const thin = per1kResult([{ ...a, days: { "2026-10-20": [500000, 70], "2026-10-27": [200000, 76] } }], base, now);
  assert.equal(thin.verdict, "too_early");
  assert.match(thin.note, /1M\+ views/);
});

test("organicResult: per-day average, 7 days needed", () => {
  const m = new Map<string, number>();
  for (let d = 20; d <= 26; d++) m.set(`2026-10-${d}`, 200);
  for (let d = 27; d <= 31; d++) m.set(`2026-10-${d}`, 260);
  m.set("2026-11-01", 260);
  m.set("2026-11-02", 260);
  const r = organicResult(m, { ...base, metric: "organic", scope: "all" }, now);
  assert.equal(r.before!.value, 200);
  assert.equal(r.after!.value, 260);
  assert.equal(r.verdict, "better");
});
