// Run: npx tsx --test lib/creators/pay.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  baseForCompletedMonths,
  completeVideoCount,
  bonusLinesForMonth,
  completedMonthsAsOf,
  creatorPrefix,
  draftInvoiceLines,
  invoiceNumber,
  isOnTime,
  monthSummary,
  nextLevel,
  trialStatus,
  weekdaysBetween,
  weekdaysInMonth,
} from "./pay";
import type { BonusClaim, DayOff, PayProfile, PostingDay } from "./types";

const vids = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    tiktok_url: `https://www.tiktok.com/@x/video/${i}`,
    instagram_url: `https://www.instagram.com/reel/${i}`,
  }));
const day = (date: string, n = 5): PostingDay => ({ date, videos: vids(n), logged_at: `${date}T20:00:00Z` });
const postAll = (from: string, to: string, skip: string[] = []) =>
  weekdaysBetween(from, to).filter((d) => !skip.includes(d)).map((d) => day(d));
const off = (date: string, status: DayOff["status"] = "approved"): DayOff => ({ date, status });
const prof = (start_date: string, starting_completed_months = 0, ended_on?: string): PayProfile => ({
  start_date,
  starting_completed_months,
  ...(ended_on ? { ended_on } : {}),
});
const sum = (p: PayProfile, month: string, pd: PostingDay[], doff: DayOff[] = [], bc: BonusClaim[] = [], adj: { month: string; amount_cents: number; note: string }[] = []) =>
  monthSummary(p, month, pd, doff, bc, adj);

test("weekdaysInMonth", () => {
  assert.equal(weekdaysInMonth("2026-10"), 22);
  assert.equal(weekdaysInMonth("2026-11"), 21);
  assert.equal(weekdaysInMonth("2027-02"), 20);
});

test("full month all posted", () => {
  const s = sum(prof("2026-10-01"), "2026-10", postAll("2026-10-01", "2026-10-31"));
  assert.equal(s.expectedWeekdays, 22);
  assert.equal(s.postedDays, 22);
  assert.equal(s.missedDays, 0);
  assert.equal(s.completed, true);
  assert.equal(s.levelBaseCents, 50000);
  assert.equal(s.baseDueCents, 50000);
  assert.equal(s.totalCents, 50000);
});

test("fewer than 5 videos does not count as posted; duplicate docs merge", () => {
  const pd = postAll("2026-10-01", "2026-10-31", ["2026-10-07"]);
  pd.push(day("2026-10-07", 4));
  assert.equal(sum(prof("2026-10-01"), "2026-10", pd).missedDays, 1);
  pd.push(day("2026-10-07", 1));
  assert.equal(sum(prof("2026-10-01"), "2026-10", pd).completed, true);
});

test("a video counts only when posted on BOTH TikTok and Instagram", () => {
  const p = prof("2026-10-01");
  const pd = postAll("2026-10-01", "2026-10-31", ["2026-10-07"]);
  const half = vids(5);
  half[2] = { ...half[2], instagram_url: "" };
  half[4] = { ...half[4], tiktok_url: "   " };
  const d7: PostingDay = { date: "2026-10-07", videos: half, logged_at: "2026-10-07T20:00:00Z" };
  assert.equal(completeVideoCount(d7), 3);
  assert.equal(sum(p, "2026-10", [...pd, d7]).missedDays, 1);
  // 6 rows with one incomplete still makes 5 complete -> posted
  const six: PostingDay = { date: "2026-10-07", videos: [...vids(5), { tiktok_url: "https://www.tiktok.com/@x/video/9", instagram_url: "" }], logged_at: "2026-10-07T20:00:00Z" };
  assert.equal(sum(p, "2026-10", [...pd, six]).completed, true);
  // weekend posts never count
  const sat: PostingDay = { date: "2026-10-10", videos: vids(5), logged_at: "2026-10-10T20:00:00Z" };
  assert.equal(sum(p, "2026-10", [...pd, sat]).postedDays, 21);
});

test("partial first month: start Thu 2026-10-15 -> 12/22 of $500 = $272.73, not completed", () => {
  const p = prof("2026-10-15");
  const pd = postAll("2026-10-15", "2026-11-30");
  const s = sum(p, "2026-10", pd);
  assert.equal(s.expectedWeekdays, 12);
  assert.equal(s.baseDueCents, 27273);
  assert.equal(s.completed, false);
  const nov = sum(p, "2026-11", pd);
  assert.equal(nov.completedMonthsBefore, 0);
  assert.equal(nov.baseDueCents, 50000);
  assert.equal(completedMonthsAsOf(p, "2026-12", { postingDays: pd, daysOff: [] }), 1);
});

test("missed weekday prorates base but does NOT pause the ladder", () => {
  const p = prof("2026-10-01");
  const pd = postAll("2026-10-01", "2026-11-30", ["2026-10-07"]);
  const oct = sum(p, "2026-10", pd);
  assert.equal(oct.missedDays, 1);
  assert.equal(oct.completed, false);
  assert.equal(oct.baseDueCents, Math.round((50000 * 21) / 22)); // 47727
  assert.equal(oct.baseDueCents, 47727);
  const nov = sum(p, "2026-11", pd);
  assert.equal(nov.completedMonthsBefore, 1); // Oct still counts despite the miss
  assert.equal(nov.levelBaseCents, 65000);
  assert.equal(sum(p, "2026-12", pd).completedMonthsBefore, 2);

  // A month with many misses (and even no posts at all) still counts toward the ladder.
  const sparse = postAll("2026-10-01", "2026-10-31").filter((_, i) => i % 3 === 0);
  const octSparse = sum(p, "2026-10", sparse);
  assert.ok(octSparse.missedDays >= 10);
  assert.ok(octSparse.baseDueCents < 50000 / 2);
  assert.equal(sum(p, "2026-11", sparse).levelBaseCents, 65000);
  assert.equal(completedMonthsAsOf(p, "2027-02", { postingDays: [], daysOff: [] }), 4);
  assert.equal(sum(p, "2027-02", []).levelBaseCents, 80000);
});

test("start on the first weekday counts as a full month (Mon 2026-11-02; Nov 1 is a Sunday)", () => {
  const p = prof("2026-11-02");
  assert.equal(completedMonthsAsOf(p, "2026-12"), 1);
  assert.equal(nextLevel(p, { postingDays: [], daysOff: [] }, "2026-11").earliestMonth, "2026-12");
});

test("approved day off still completes and is paid; requested/declined do not", () => {
  const p = prof("2026-10-01");
  const pd = postAll("2026-10-01", "2026-10-31", ["2026-10-07"]);
  const s = sum(p, "2026-10", pd, [off("2026-10-07")]);
  assert.equal(s.approvedOffDays, 1);
  assert.equal(s.completed, true);
  assert.equal(s.baseDueCents, 50000);
  assert.equal(sum(p, "2026-10", pd, [off("2026-10-07", "requested")]).completed, false);
  assert.equal(sum(p, "2026-10", pd, [off("2026-10-07", "declined")]).baseDueCents, 47727);
});

test("ladder thresholds 1 / 4 / 8 / 12", () => {
  const expect: [number, number][] = [[0, 50000], [1, 65000], [3, 65000], [4, 80000], [7, 80000], [8, 95000], [11, 95000], [12, 110000], [40, 110000]];
  for (const [m, c] of expect) assert.equal(baseForCompletedMonths(m), c, `months=${m}`);

  const p = prof("2026-01-01");
  const pd = postAll("2026-01-01", "2027-02-28");
  const lvl = (m: string) => sum(p, m, pd).levelBaseCents;
  assert.equal(lvl("2026-01"), 50000);
  assert.equal(lvl("2026-02"), 65000);
  assert.equal(lvl("2026-04"), 65000);
  assert.equal(lvl("2026-05"), 80000);
  assert.equal(lvl("2026-09"), 95000);
  assert.equal(lvl("2026-12"), 95000);
  assert.equal(lvl("2027-01"), 110000);
});

test("Isai: starting_completed_months=1 -> Oct 2026 $650, $800 from Jan 2027", () => {
  // Data: start_date 2026-10-01, starting_completed_months 1 (Sept 2026 = month 1).
  const isai = prof("2026-10-01", 1);
  const pd = postAll("2026-10-01", "2027-01-31");
  const oct = sum(isai, "2026-10", pd);
  assert.equal(oct.levelBaseCents, 65000);
  assert.equal(oct.baseDueCents, 65000);
  assert.deepEqual(nextLevel(isai, { postingDays: pd, daysOff: [] }, "2026-10"), {
    nextBaseCents: 80000,
    monthsNeeded: 3,
    earliestMonth: "2027-01",
  });
  assert.equal(sum(isai, "2026-12", pd).levelBaseCents, 65000);
  assert.equal(sum(isai, "2027-01", pd).levelBaseCents, 80000);
  assert.equal(sum(isai, "2027-01", pd).completedMonthsBefore, 4);

  // A missed day in November costs that day's pay but does NOT push $800 back.
  const pdMiss = postAll("2026-10-01", "2027-02-28", ["2026-11-10"]);
  assert.equal(sum(isai, "2026-11", pdMiss).baseDueCents, Math.round((65000 * 20) / 21));
  assert.equal(sum(isai, "2027-01", pdMiss).levelBaseCents, 80000);
  assert.equal(nextLevel(isai, { postingDays: pdMiss, daysOff: [] }, "2026-12").earliestMonth, "2027-01");
});

test("nextLevel: partial first month is skipped; top level returns nulls", () => {
  const p = prof("2026-10-15");
  assert.deepEqual(nextLevel(p, { postingDays: [], daysOff: [] }, "2026-10"), {
    nextBaseCents: 65000,
    monthsNeeded: 1,
    earliestMonth: "2026-12",
  });
  assert.deepEqual(nextLevel(prof("2026-10-01", 12), { postingDays: [], daysOff: [] }, "2026-10"), {
    nextBaseCents: null,
    monthsNeeded: null,
    earliestMonth: null,
  });
});

const claim = (o: Partial<BonusClaim>): BonusClaim => ({
  video_url: "https://www.tiktok.com/@isai/video/1",
  platform: "tiktok",
  posted_on: "2026-10-05",
  views_claimed: 0,
  status: "approved",
  ...o,
});
const total = (lines: { amount_cents: number }[]) => lines.reduce((s, l) => s + l.amount_cents, 0);

test("bonus: 100K only -> $15 in the crossing month", () => {
  const c = [claim({ crossed_100k_on: "2026-10-20" })];
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 1500);
  assert.equal(total(bonusLinesForMonth(c, "2026-11")), 0);
});

test("bonus: 1M same month as 100K -> $100 once", () => {
  const c = [claim({ crossed_100k_on: "2026-10-08", crossed_1m_on: "2026-10-20" })];
  const lines = bonusLinesForMonth(c, "2026-10");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "bonus_1m");
  assert.equal(total(lines), 10000);
  // 1M with no 100K date recorded -> also $100
  assert.equal(total(bonusLinesForMonth([claim({ crossed_1m_on: "2026-10-20" })], "2026-10")), 10000);
});

test("bonus: 100K one month then 1M next month -> $15 then +$85", () => {
  const c = [claim({ posted_on: "2026-10-25", crossed_100k_on: "2026-10-28", crossed_1m_on: "2026-11-10" })];
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 1500);
  const nov = bonusLinesForMonth(c, "2026-11");
  assert.equal(nov[0].kind, "bonus_1m_topup");
  assert.equal(total(nov), 8500);
});

test("bonus: per platform (1M on TikTok and Instagram = $200)", () => {
  const c = [
    claim({ crossed_1m_on: "2026-10-20" }),
    claim({ platform: "instagram", video_url: "https://www.instagram.com/reel/abc", crossed_1m_on: "2026-10-22" }),
  ];
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 20000);
});

test("bonus: crossing after 30 days = nothing; day 30 counts", () => {
  assert.equal(total(bonusLinesForMonth([claim({ posted_on: "2026-10-01", crossed_100k_on: "2026-11-01" })], "2026-11")), 0); // 31 days
  assert.equal(total(bonusLinesForMonth([claim({ posted_on: "2026-10-01", crossed_100k_on: "2026-10-31" })], "2026-10")), 1500); // 30 days
  // 100K in time, 1M late -> only the $15
  const c = [claim({ posted_on: "2026-10-01", crossed_100k_on: "2026-10-10", crossed_1m_on: "2026-11-15" })];
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 1500);
  assert.equal(total(bonusLinesForMonth(c, "2026-11")), 0);
});

test("bonus: rejected / unapproved claims excluded; duplicate approved claims not double-paid", () => {
  assert.equal(total(bonusLinesForMonth([claim({ status: "rejected", crossed_1m_on: "2026-10-20" })], "2026-10")), 0);
  assert.equal(total(bonusLinesForMonth([claim({ status: "claimed", crossed_1m_on: "2026-10-20" })], "2026-10")), 0);
  assert.equal(total(bonusLinesForMonth([claim({ crossed_100k_on: "2026-10-20" }), claim({ crossed_100k_on: "2026-10-21" })], "2026-10")), 1500);
});

test("adjustments +/- are added as lines for their month only", () => {
  const p = prof("2026-10-01");
  const s = sum(p, "2026-10", postAll("2026-10-01", "2026-10-31"), [], [claim({ crossed_100k_on: "2026-10-20" })], [
    { month: "2026-10", amount_cents: 2500, note: "Extra video" },
    { month: "2026-10", amount_cents: -1000, note: "Overpayment correction" },
    { month: "2026-11", amount_cents: 99999, note: "Other month" },
  ]);
  assert.equal(s.adjustmentLines.length, 2);
  assert.equal(s.totalCents, 50000 + 1500 + 2500 - 1000);
  const lines = draftInvoiceLines(s);
  assert.deepEqual(lines.map((l) => l.kind), ["base", "bonus_100k", "adjustment", "adjustment"]);
  assert.equal(total(lines), s.totalCents);
});

test("leaving mid-month: final month prorated through ended_on inclusive", () => {
  const p = prof("2026-10-01", 1, "2026-11-13");
  const pd = postAll("2026-10-01", "2026-11-13");
  const nov = sum(p, "2026-11", pd);
  assert.equal(nov.expectedWeekdays, 10);
  assert.equal(nov.completedMonthsBefore, 2);
  assert.equal(nov.levelBaseCents, 65000);
  assert.equal(nov.baseDueCents, Math.round((65000 * 10) / 21)); // 30952
  assert.equal(nov.missedDays, 0);
  assert.equal(nov.completed, false);
  assert.equal(sum(p, "2026-12", pd).baseDueCents, 0);
});

test("in-progress month with today: future weekdays pending, not missed", () => {
  const p = prof("2026-10-01");
  const s = monthSummary(p, "2026-10", postAll("2026-10-01", "2026-10-05"), [], [], [], { today: "2026-10-06" });
  assert.equal(s.postedDays, 3);
  assert.equal(s.missedDays, 0);
  assert.equal(s.pendingDays, 19);
  assert.equal(s.completed, false);
});

test("trialStatus: first 10 posted weekdays", () => {
  const pd = postAll("2026-10-01", "2026-10-31");
  assert.deepEqual(trialStatus(pd.slice(0, 4)), { postedDays: 4, isInTrial: true });
  const t = trialStatus(pd);
  assert.equal(t.isInTrial, false);
  assert.equal(t.trialEndsAfterDate, "2026-10-14");
});

test("isOnTime uses the creator's timezone", () => {
  // 2026-10-07 04:30Z = 2026-10-06 23:30 in Chicago (CDT, UTC-5)
  assert.equal(isOnTime("2026-10-07T04:30:00Z", "2026-10-06", "America/Chicago"), true);
  // 2026-10-07 05:30Z = 2026-10-07 00:30 in Chicago -> late
  assert.equal(isOnTime("2026-10-07T05:30:00Z", "2026-10-06", "America/Chicago"), false);
  assert.equal(isOnTime("2026-10-06T12:00:00Z", "2026-10-06", "Asia/Kolkata"), true);
});

test("creatorPrefix and invoiceNumber", () => {
  assert.equal(creatorPrefix("Isai Trujillo"), "IT");
  assert.equal(creatorPrefix("  mary jane watson "), "MJW");
  assert.equal(invoiceNumber("IT", 1), "IT-001");
  assert.equal(invoiceNumber("IT", 42), "IT-042");
  assert.equal(invoiceNumber("IT", 1234), "IT-1234");
});
