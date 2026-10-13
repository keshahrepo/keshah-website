// Run: npx tsx --test lib/creators/pay.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPostedDay,
  baseForCompletedMonths,
  completeVideoCount,
  bonusLinesForMonth,
  bonusCostForMonth,
  bonusPayoutMonth,
  bonusRuleFor,
  BONUS_HIT_MONTH_RULE_FROM,
  completedMonthsAsOf,
  creatorPrefix,
  dayComplete,
  dayPayCents,
  postingStreak,
  draftInvoiceLines,
  invoiceNumber,
  isScheduledDay,
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

// ---- old rule: videos posted before BONUS_HIT_MONTH_RULE_FROM (2026-10-01)

test("bonus (old rule, posted before Oct 2026): paid on the invoice for the month after posting, not before", () => {
  const c = [claim({ posted_on: "2026-09-05", crossed_100k_on: "2026-09-20" })];
  assert.equal(total(bonusLinesForMonth(c, "2026-09")), 0);
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 1500);
  assert.equal(total(bonusLinesForMonth(c, "2026-11")), 0);
  assert.equal(bonusLinesForMonth(c, "2026-10")[0].rule, "old");
});

test("bonus (old rule): 1M -> one $100 line", () => {
  const c = [claim({ posted_on: "2026-09-05", crossed_100k_on: "2026-09-08", crossed_1m_on: "2026-09-20" })];
  const lines = bonusLinesForMonth(c, "2026-10");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "bonus_1m");
  assert.equal(total(lines), 10000);
  // 1M with no 100K date recorded -> also $100
  assert.equal(total(bonusLinesForMonth([claim({ posted_on: "2026-09-05", crossed_1m_on: "2026-09-20" })], "2026-10")), 10000);
});

test("bonus (old rule): 100K in posting month, 1M the next month -> one $100 line, no split", () => {
  const c = [claim({ posted_on: "2026-09-25", crossed_100k_on: "2026-09-28", crossed_1m_on: "2026-10-10" })];
  assert.equal(total(bonusLinesForMonth(c, "2026-09")), 0);
  const oct = bonusLinesForMonth(c, "2026-10");
  assert.equal(oct.length, 1);
  assert.equal(oct[0].kind, "bonus_1m");
  assert.equal(total(oct), 10000);
  assert.equal(total(bonusLinesForMonth(c, "2026-11")), 0);
});

test("bonus: per platform (1M on TikTok and Instagram = $200)", () => {
  const c = [
    claim({ posted_on: "2026-09-05", crossed_1m_on: "2026-09-20" }),
    claim({ posted_on: "2026-09-05", platform: "instagram", video_url: "https://www.instagram.com/reel/abc", crossed_1m_on: "2026-09-22" }),
  ];
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 20000);
  const n = [
    claim({ crossed_1m_on: "2026-10-20" }),
    claim({ platform: "instagram", video_url: "https://www.instagram.com/reel/abc", crossed_1m_on: "2026-10-22" }),
  ];
  assert.equal(total(bonusLinesForMonth(n, "2026-10")), 20000);
});

test("bonus: crossing after 30 days = nothing; day 30 counts", () => {
  // old rule
  assert.equal(total(bonusLinesForMonth([claim({ posted_on: "2026-09-01", crossed_100k_on: "2026-10-02" })], "2026-10")), 0); // 31 days
  assert.equal(total(bonusLinesForMonth([claim({ posted_on: "2026-09-01", crossed_100k_on: "2026-10-01" })], "2026-10")), 1500); // 30 days
  // new rule
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

// ---- new rule: videos posted on/after 2026-10-01, paid for the month the milestone was hit

test("bonus (new rule): 100K is paid on the invoice for the month it was hit", () => {
  const c = [claim({ crossed_100k_on: "2026-10-20" })]; // posted 2026-10-05
  assert.equal(total(bonusLinesForMonth(c, "2026-10")), 1500);
  assert.equal(total(bonusLinesForMonth(c, "2026-11")), 0);
  const l = bonusLinesForMonth(c, "2026-10")[0];
  assert.equal(l.kind, "bonus_100k");
  assert.equal(l.label, "100K views bonus: TikTok video posted 2026-10-05 (https://www.tiktok.com/@isai/video/1)");
  assert.deepEqual([l.milestone, l.hit_on, l.rule, l.posted_on, l.platform], ["100k", "2026-10-20", "new", "2026-10-05", "tiktok"]);
  // Posted late in a month, hit early the next: that next month's invoice.
  const late = [claim({ posted_on: "2026-10-28", crossed_100k_on: "2026-11-02" })];
  assert.equal(total(bonusLinesForMonth(late, "2026-10")), 0);
  assert.equal(total(bonusLinesForMonth(late, "2026-11")), 1500);
});

test("bonus (new rule): 100K in October, 1M in November -> $15 on October, $85 on November", () => {
  const c = [claim({ posted_on: "2026-10-15", crossed_100k_on: "2026-10-20", crossed_1m_on: "2026-11-05" })];
  const oct = bonusLinesForMonth(c, "2026-10");
  const nov = bonusLinesForMonth(c, "2026-11");
  assert.deepEqual(oct.map((l) => [l.kind, l.amount_cents, l.milestone]), [["bonus_100k", 1500, "100k"]]);
  assert.deepEqual(nov.map((l) => [l.kind, l.amount_cents, l.milestone, l.hit_on]), [["bonus_1m_topup", 8500, "1m_rest", "2026-11-05"]]);
  assert.match(nov[0].label, /^1M views bonus: TikTok video posted 2026-10-15/);
  assert.equal(total(bonusLinesForMonth(c, "2026-12")), 0);
});

test("bonus (new rule): 100K and 1M in the same month -> one $100 line", () => {
  const c = [claim({ crossed_100k_on: "2026-10-08", crossed_1m_on: "2026-10-20" })];
  const lines = bonusLinesForMonth(c, "2026-10");
  assert.deepEqual(lines.map((l) => [l.kind, l.amount_cents, l.milestone]), [["bonus_1m", 10000, "1m"]]);
  assert.equal(total(bonusLinesForMonth(c, "2026-11")), 0);
  // 1M seen first (no 100K date): the whole $100 in the month of the 1M.
  assert.equal(total(bonusLinesForMonth([claim({ posted_on: "2026-10-25", crossed_1m_on: "2026-11-03" })], "2026-11")), 10000);
});

test("bonus cutover: the posting date decides the rule; nothing paid twice or dropped", () => {
  const sep = claim({ video_url: "https://www.tiktok.com/@isai/video/9", posted_on: "2026-09-30", crossed_100k_on: "2026-10-02" });
  const oct = claim({ video_url: "https://www.tiktok.com/@isai/video/10", posted_on: "2026-10-01", crossed_100k_on: "2026-10-02" });
  const later = claim({ video_url: "https://www.tiktok.com/@isai/video/11", posted_on: "2026-10-20", crossed_100k_on: "2026-10-25", crossed_1m_on: "2026-11-02" });
  const all = [sep, oct, later];
  const months = ["2026-09", "2026-10", "2026-11", "2026-12"];
  const paid = months.map((m) => total(bonusLinesForMonth(all, m)));
  assert.deepEqual(paid, [0, 1500 + 1500 + 1500, 8500, 0]);
  assert.equal(paid.reduce((a, b) => a + b, 0), 1500 + 1500 + 10000);
  assert.deepEqual(bonusLinesForMonth(all, "2026-10").map((l) => l.rule), ["old", "new", "new"]);
});

test("bonus: Isai's September bonuses ($740) stay on the October invoice exactly once", () => {
  // 5 x 1M ($500) + 16 x 100K ($240) on September videos. One passes 1M on
  // Oct 15 and some pass 100K in early October: still the old rule.
  const sep: BonusClaim[] = [];
  for (let k = 0; k < 4; k++) sep.push(claim({ video_url: `https://www.tiktok.com/@isai/video/m${k}`, posted_on: "2026-09-10", crossed_100k_on: "2026-09-12", crossed_1m_on: "2026-09-20" }));
  sep.push(claim({ video_url: "https://www.instagram.com/reel/sep", platform: "instagram", posted_on: "2026-09-20", crossed_100k_on: "2026-09-25", crossed_1m_on: "2026-10-15" }));
  for (let k = 0; k < 16; k++) sep.push(claim({ video_url: `https://www.tiktok.com/@isai/video/k${k}`, posted_on: "2026-09-22", crossed_100k_on: k < 8 ? "2026-09-28" : "2026-10-03" }));
  // An October video hitting 100K on Oct 20 and 1M on Nov 5 (new rule).
  const octVideo = claim({ video_url: "https://www.tiktok.com/@isai/video/oct", posted_on: "2026-10-12", crossed_100k_on: "2026-10-20", crossed_1m_on: "2026-11-05" });
  const all = [...sep, octVideo];
  const oct = bonusLinesForMonth(all, "2026-10");
  assert.equal(total(oct.filter((l) => l.rule === "old")), 74000);
  assert.equal(total(oct.filter((l) => l.rule === "new")), 1500);
  assert.equal(total(oct), 75500); // October invoice, paid Nov 1
  // Once October is frozen, November carries only the October video's $85.
  const octInv = { month: "2026-10", status: "submitted" as const, lines: oct };
  const nov = bonusLinesForMonth(all, "2026-11", [octInv]);
  assert.deepEqual(nov.map((l) => [l.amount_cents, l.milestone, l.rule]), [[8500, "1m_rest", "new"]]); // paid Dec 1
  assert.equal(total(bonusLinesForMonth(all, "2026-12", [octInv, { month: "2026-11", status: "paid" as const, lines: nov }])), 0);
  assert.equal(total(bonusLinesForMonth(all, "2026-09")), 0);
});

test("bonus: a frozen invoice is never re-paid; a milestone it missed moves to the next open invoice", () => {
  const c100 = claim({ posted_on: "2026-10-15", crossed_100k_on: "2026-10-20", crossed_1m_on: "2026-11-05" });
  const octLines = bonusLinesForMonth([c100], "2026-10");
  const octInv = { month: "2026-10", status: "submitted" as const, lines: octLines };
  // November: just the $85.
  assert.equal(total(bonusLinesForMonth([c100], "2026-11", [octInv])), 8500);
  // October was submitted before the claim was approved: the $15 comes on November with the $85.
  const emptyOct = { month: "2026-10", status: "paid" as const, lines: [] };
  const nov = bonusLinesForMonth([c100], "2026-11", [emptyOct]);
  assert.deepEqual(nov.map((l) => [l.kind, l.amount_cents, l.milestone]), [["bonus_1m", 10000, "1m"]]);
  // October still a draft: it pays its own $15, November only the $85.
  assert.equal(total(bonusLinesForMonth([c100], "2026-11", [{ ...emptyOct, status: "draft" as const }])), 8500);
  // A late approval of a September (old-rule) video after October was frozen: November, once.
  const sepLate = claim({ video_url: "https://www.tiktok.com/@isai/video/late", posted_on: "2026-09-20", crossed_100k_on: "2026-09-25" });
  assert.equal(total(bonusLinesForMonth([sepLate], "2026-11", [emptyOct])), 1500);
  // ...but not when the frozen October invoice already paid it (older line without fields: matched by its label).
  const legacy = { month: "2026-10", status: "paid" as const, lines: [{ kind: "bonus_100k" as const, label: "100K views bonus: TikTok video posted 2026-09-20 (https://www.tiktok.com/@isai/video/late)", amount_cents: 1500 }] };
  assert.equal(total(bonusLinesForMonth([sepLate], "2026-11", [legacy])), 0);
  assert.equal(total(bonusLinesForMonth([sepLate], "2026-12", [legacy, { month: "2026-11", status: "paid" as const, lines: [] }])), 0);
  // Invoices before the cutover month are never re-examined (old behaviour).
  const aug = claim({ video_url: "https://www.tiktok.com/@isai/video/aug", posted_on: "2026-08-20", crossed_100k_on: "2026-08-25" });
  assert.equal(total(bonusLinesForMonth([aug], "2026-10", [{ month: "2026-09", status: "paid" as const, lines: [] }])), 0);
});

test("bonusCostForMonth: new rule counts the month hit, old rule the posting month", () => {
  const c = [
    claim({ video_url: "https://www.tiktok.com/@isai/video/s", posted_on: "2026-09-20", crossed_100k_on: "2026-10-05" }),
    claim({ video_url: "https://www.tiktok.com/@isai/video/o", posted_on: "2026-10-15", crossed_100k_on: "2026-10-20", crossed_1m_on: "2026-11-05" }),
  ];
  assert.equal(bonusCostForMonth(c, "2026-09"), 1500);
  assert.equal(bonusCostForMonth(c, "2026-10"), 1500);
  assert.equal(bonusCostForMonth(c, "2026-11"), 8500);
  assert.equal(bonusCostForMonth(c, "2026-12"), 0);
});

test("bonusPayoutMonth: the month after the hit (new), two after posting (old)", () => {
  assert.equal(bonusRuleFor("2026-09-30"), "old");
  assert.equal(bonusRuleFor(BONUS_HIT_MONTH_RULE_FROM), "new");
  assert.equal(bonusPayoutMonth("2026-10-15", "2026-10-20"), "2026-11");
  assert.equal(bonusPayoutMonth("2026-10-15", "2026-11-05"), "2026-12");
  assert.equal(bonusPayoutMonth("2026-09-20", "2026-10-05"), "2026-11");
});

test("adjustments +/- are added as lines for their month only", () => {
  const p = prof("2026-10-01");
  const s = sum(p, "2026-10", postAll("2026-10-01", "2026-10-31"), [], [claim({ posted_on: "2026-09-25", crossed_100k_on: "2026-10-01" })], [
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

// ---------------------------------------------------------------- day complete

test("dayPayCents: level base split over the month's calendar weekdays", () => {
  assert.equal(dayPayCents(50000, "2026-10"), 2273); // 22 weekdays
  assert.equal(dayPayCents(65000, "2026-11"), 3095); // 21 weekdays
  assert.equal(dayPayCents(80000, "2027-02"), 4000); // 20 weekdays, whole dollars
});

test("postingStreak: weekends skipped, approved days off don't break it", () => {
  const p = prof("2026-09-01");
  // Mon 5 Oct .. Fri 9 Oct, with Wed 7 Oct an approved day off; Fri 2 Oct also posted.
  const pd = [day("2026-10-02"), day("2026-10-05"), day("2026-10-06"), day("2026-10-08"), day("2026-10-09")];
  assert.equal(postingStreak(p, pd, [off("2026-10-07")], "2026-10-09"), 5);
  // Without the approved day off the missed Wednesday breaks it.
  assert.equal(postingStreak(p, pd, [], "2026-10-09"), 2);
  // A requested (not approved) day off still breaks it.
  assert.equal(postingStreak(p, pd, [off("2026-10-07", "requested")], "2026-10-09"), 2);
  // Monday after a posted Friday: the weekend doesn't break it.
  assert.equal(postingStreak(p, [day("2026-10-09"), day("2026-10-12")], [], "2026-10-12"), 2);
  // Not posted today: 0. Fewer than 5 videos doesn't count.
  assert.equal(postingStreak(p, [day("2026-10-09"), day("2026-10-12", 4)], [], "2026-10-12"), 0);
});

test("postingStreak stops at start_date", () => {
  const pd = [day("2026-10-01"), day("2026-10-02"), day("2026-10-05")];
  assert.equal(postingStreak(prof("2026-10-02"), pd, [], "2026-10-05"), 2);
  assert.equal(postingStreak(prof("2026-10-05"), pd, [off("2026-10-02")], "2026-10-05"), 1);
});

test("dayComplete: numbers only when this save made the day count", () => {
  const p = prof("2026-10-01");
  const earlier = postAll("2026-10-01", "2026-10-05"); // Thu, Fri, Mon
  const before = [...earlier, day("2026-10-06", 4)];
  const after = [...earlier, day("2026-10-06", 5)];
  const dc = dayComplete(p, "2026-10-06", before, after, []);
  assert.ok(dc);
  assert.equal(dc.dayPayCents, 2273);
  assert.equal(dc.monthBaseCents, 50000);
  // 4 posted of 22 weekdays.
  assert.equal(dc.monthEarnedCents, Math.round((50000 * 4) / 22));
  assert.equal(dc.streak, 4);
  assert.deepEqual(dc.nextLevel, { nextBaseCents: 65000, earliestMonth: "2026-11" });
  // Already counted before this save (e.g. the post sync found everything): nothing.
  assert.equal(dayComplete(p, "2026-10-06", after, after, []), null);
  // Still short after the save: nothing.
  assert.equal(dayComplete(p, "2026-10-06", before, before, []), null);
  // A video on only one platform doesn't count.
  const oneMissing = [...earlier, { ...day("2026-10-06", 5), videos: [...vids(4), { tiktok_url: "https://www.tiktok.com/@x/video/9", instagram_url: "" }] }];
  assert.equal(dayComplete(p, "2026-10-06", before, oneMissing, []), null);
  // Weekend, before start, after ended_on, or an already credited day off: nothing.
  assert.equal(dayComplete(p, "2026-10-10", [], [day("2026-10-10")], []), null);
  assert.equal(dayComplete(prof("2026-10-07"), "2026-10-06", before, after, []), null);
  assert.equal(dayComplete(prof("2026-10-01", 0, "2026-10-05"), "2026-10-06", before, after, []), null);
  assert.equal(dayComplete(p, "2026-10-06", before, after, [off("2026-10-06")]), null);
});

test("dayComplete: earned matches monthSummary and level follows the ladder", () => {
  const p = prof("2026-06-01"); // 4 full months before October
  const hist = postAll("2026-06-01", "2026-10-05", ["2026-10-01"]);
  const after = [...hist, day("2026-10-06")];
  const dc = dayComplete(p, "2026-10-06", hist, after, [off("2026-10-01")]);
  assert.ok(dc);
  const s = monthSummary(p, "2026-10", after, [off("2026-10-01")], [], [], { today: "2026-10-06" });
  assert.equal(dc.monthEarnedCents, s.baseDueCents);
  assert.equal(dc.monthBaseCents, 80000);
  assert.equal(dc.dayPayCents, dayPayCents(80000, "2026-10"));
  assert.deepEqual(dc.nextLevel, { nextBaseCents: 95000, earliestMonth: "2027-02" });
  // Every weekday since 1 June posted except Oct 1, an approved day off: skipped, not counted, not a break.
  assert.equal(dc.streak, weekdaysBetween("2026-06-01", "2026-10-06").length - 1);
});

test("dayComplete: no raise line at the top of the ladder", () => {
  const p = prof("2026-10-01", 12);
  const dc = dayComplete(p, "2026-10-01", [], [day("2026-10-01")], []);
  assert.ok(dc);
  assert.equal(dc.nextLevel, null);
  assert.equal(dc.streak, 1);
});

// ---------------------------------------------------------------- trial v2

const v2 = (start_date: string, extra: Partial<PayProfile> = {}): PayProfile => ({ ...prof(start_date), trial_plan: "v2", ...extra });
// Oct 2026: the 20th weekday from Oct 1 is Oct 28.
const trialOct = () => weekdaysBetween("2026-10-01", "2026-10-28").map((d) => day(d, 3));
const kept = (on = "2026-10-28") => v2("2026-10-01", { trial_outcome: "keep", trial_decided_on: on });

test("v2: 3 videos count during the trial, $15 a day, no base", () => {
  const pd = weekdaysBetween("2026-10-01", "2026-10-09").map((d) => day(d, 3));
  const s = monthSummary(v2("2026-10-01"), "2026-10", pd, [], [], [], { today: "2026-10-12" });
  assert.equal(s.postedDays, 7);
  assert.equal(s.trialDays, 7);
  assert.equal(s.trialCents, 7 * 1500);
  assert.equal(s.baseDueCents, 0);
  assert.equal(s.totalCents, 10500);
  assert.deepEqual(draftInvoiceLines(s).map((l) => [l.kind, l.amount_cents]), [["trial", 10500]]);
  const t = trialStatus(pd, v2("2026-10-01"));
  assert.equal(t.isInTrial, true);
  assert.equal(t.postedDays, 7);
  assert.equal(t.requiredDays, 20);
  assert.equal(t.totalCents, 30000);
});

test("v2: after day 20 it waits for a decision, nothing expected, no auto-promotion", () => {
  const p = v2("2026-10-01");
  const pd = [...trialOct(), day("2026-10-29", 5)];
  const t = trialStatus(pd, p);
  assert.equal(t.reviewing, true);
  assert.equal(t.isInTrial, true);
  assert.equal(t.promotedOn, undefined);
  const s = monthSummary(p, "2026-10", pd, [], [], [], { today: "2026-10-30" });
  assert.equal(s.trialCents, 30000);
  assert.equal(s.baseDueCents, 0);
  assert.equal(s.expectedWeekdays, 20); // Oct 29-30 aren't expected
  assert.equal(s.missedDays, 0);
  assert.equal(s.pendingDays, 0);
  assert.equal(isScheduledDay(p, pd, "2026-10-29"), false);
  assert.equal(dayComplete(p, "2026-10-29", trialOct(), pd, []), null);
});

test("v2: keep starts the full plan the weekday after the decision", () => {
  const p = kept("2026-10-29"); // decided Thu Oct 29 -> full plan from Fri Oct 30
  const pd = [...trialOct(), day("2026-10-30", 5)];
  const t = trialStatus(pd, p);
  assert.equal(t.isInTrial, false);
  assert.equal(t.promotedOn, "2026-10-30");
  const s = monthSummary(p, "2026-10", pd, [], [], []);
  assert.equal(s.trialCents, 30000);
  assert.equal(s.baseCreditedDays, 1);
  assert.equal(s.baseDueCents, Math.round(50000 / 22));
  assert.equal(s.expectedWeekdays, 21); // 20 trial days + Oct 30; Oct 29 was the review day
  assert.equal(s.missedDays, 0);
  assert.deepEqual(draftInvoiceLines(s).map((l) => l.kind), ["trial", "base"]);
  // 3 videos after promotion don't count.
  const s3 = monthSummary(p, "2026-10", [...trialOct(), day("2026-10-30", 3)], [], [], []);
  assert.equal(s3.baseCreditedDays, 0);
  assert.equal(s3.missedDays, 1);
});

test("v2: end stops everything at day 20, paid the full $300", () => {
  const p = v2("2026-10-01", { trial_outcome: "end", trial_decided_on: "2026-10-29" });
  const t = trialStatus(trialOct(), p);
  assert.equal(t.ended, true);
  assert.equal(t.isInTrial, false);
  const s = monthSummary(p, "2026-10", trialOct(), [], [], []);
  assert.equal(s.totalCents, 30000);
  assert.equal(s.missedDays, 0);
  assert.equal(nextLevel(p, { postingDays: trialOct(), daysOff: [] }, "2026-10").earliestMonth, null);
});

test("v2: ladder counts from promotion; bonuses only for videos posted after it", () => {
  const p = kept();
  const pd = [...trialOct(), ...postAll("2026-10-29", "2026-12-31")];
  const hist = { postingDays: pd, daysOff: [] };
  assert.equal(completedMonthsAsOf(p, "2026-11", hist), 0);
  assert.equal(completedMonthsAsOf(p, "2026-12", hist), 1);
  assert.equal(monthSummary(p, "2026-11", pd, [], [], []).levelBaseCents, 50000);
  assert.equal(monthSummary(p, "2026-12", pd, [], [], []).levelBaseCents, 65000);
  assert.equal(nextLevel(p, hist, "2026-10").earliestMonth, "2026-12");
  const claim = (posted_on: string): BonusClaim => ({
    platform: "tiktok",
    video_url: `https://www.tiktok.com/@x/video/${posted_on}`,
    posted_on,
    crossed_100k_on: posted_on,
    status: "approved",
  } as BonusClaim);
  // Hit the day they were posted, so paid on October's invoice (the 20th was a trial video).
  const s = monthSummary(p, "2026-10", pd, [], [claim("2026-10-20"), claim("2026-10-29")], []);
  assert.equal(s.bonusLines.length, 1);
  assert.match(s.bonusLines[0].label, /2026-10-29/);
});

test("v2: dayComplete pays $15 on trial days and flags the 20th", () => {
  const p = v2("2026-10-01");
  const dc = dayComplete(p, "2026-10-28", trialOct().slice(0, 19), trialOct(), [])!;
  assert.equal(dc.dayPayCents, 1500);
  assert.equal(dc.monthEarnedCents, 30000);
  assert.deepEqual(dc.trial, { day: 20, of: 20, totalCents: 30000, complete: true });
  const mid = dayComplete(p, "2026-10-05", trialOct().slice(0, 2), trialOct().slice(0, 3), [])!;
  assert.deepEqual(mid.trial, { day: 3, of: 20, totalCents: 30000, complete: false });
});

test("original plan unchanged: 3 videos don't count", () => {
  const pd = weekdaysBetween("2026-10-01", "2026-10-09").map((d) => day(d, 3));
  const s = monthSummary(prof("2026-10-01"), "2026-10", pd, [], [], []);
  assert.equal(s.postedDays, 0);
  assert.equal(s.trialCents, 0);
});

test("a short weekday the founder counted counts as posted (and a weekend never does)", () => {
  const short = { date: "2026-10-12", videos: [1, 2, 3, 4].map((k) => ({ tiktok_url: `t${k}`, instagram_url: `i${k}` })), logged_at: "x" };
  assert.equal(isPostedDay([short], "2026-10-12"), false);
  assert.equal(isPostedDay([{ ...short, counted_by_founder: "Filmed the pinned video how-to" }], "2026-10-12"), true);
  assert.equal(isPostedDay([{ ...short, date: "2026-10-11", counted_by_founder: "x" }], "2026-10-11"), false);
});
