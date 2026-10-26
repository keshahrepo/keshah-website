// Run: npx tsx --test lib/creators/lifecycle.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FieldValue } from "firebase-admin/firestore";
import {
  adjustmentTarget,
  approvedClaimDates,
  bankLabel,
  carriedNote,
  finalPayFor,
  firstPostingDay,
  inPostEndWindow,
  lastInvoiceMonth,
  nextWeekdayAfter,
  postEndUntil,
  unpaidTrialCents,
} from "./lifecycle";
import { bonusLinesForMonth, monthSummary } from "./pay";
import { planOffboard, planReactivate, passwordsResetPending, phoneCheckPending, shouldReactivate, isOffboarded } from "./offboard";
import { firstDayEveDate, postingNudgeDate, syncIsFresh, warmupNudgeDate } from "./nudges";
import type { Adjustment, BonusClaim, Invoice } from "./types";

// ---------------------------------------------------------------- first posting day

test("first posting day is the next weekday after Getting started is finished (never the warm-up's last day)", () => {
  // Finished Wednesday Oct 14 (Chicago) -> Thursday.
  assert.equal(firstPostingDay("2026-10-14T20:00:00Z", "America/Chicago"), "2026-10-15");
  // Friday -> Monday.
  assert.equal(firstPostingDay("2026-10-16T15:00:00Z", "America/New_York"), "2026-10-19");
  // 01:00 UTC Saturday is still Friday evening in LA -> Monday.
  assert.equal(firstPostingDay("2026-10-17T01:00:00Z", "America/Los_Angeles"), "2026-10-19");
  // Finished on a Sunday -> Monday.
  assert.equal(firstPostingDay("2026-10-18T15:00:00Z", "America/New_York"), "2026-10-19");
  assert.equal(firstPostingDay(null, "America/New_York"), null);
  assert.equal(nextWeekdayAfter("2026-10-16"), "2026-10-19");
});

// ---------------------------------------------------------------- after the end

test("after the end: posts sync and invoices run through the 30-day bonus window", () => {
  assert.equal(postEndUntil("2026-10-14"), "2026-11-13");
  assert.equal(inPostEndWindow("2026-10-14", "2026-11-13"), true);
  assert.equal(inPostEndWindow("2026-10-14", "2026-11-14"), false);
  assert.equal(inPostEndWindow(undefined, "2026-10-01"), false);
  assert.equal(lastInvoiceMonth("2026-10-14"), "2026-11");
  assert.equal(lastInvoiceMonth("2026-10-01"), "2026-10");
});

// ---------------------------------------------------------------- adjustments

const inv = (month: string, status: Invoice["status"], over: Partial<Invoice> = {}): Invoice => ({
  number: `X-${month}`,
  month,
  lines: [],
  total_cents: 0,
  status,
  locked: status === "paid",
  ...over,
});

test("an adjustment for a submitted month carries to the next open month, and is paid there", () => {
  const invoices = [inv("2026-09", "paid"), inv("2026-10", "submitted")];
  assert.deepEqual(adjustmentTarget("2026-10", invoices), { month: "2026-11", carriedFrom: "2026-10" });
  assert.deepEqual(adjustmentTarget("2026-09", invoices), { month: "2026-11", carriedFrom: "2026-09" });
  assert.deepEqual(adjustmentTarget("2026-11", invoices), { month: "2026-11", carriedFrom: null });
  // A draft month is still open.
  assert.deepEqual(adjustmentTarget("2026-10", [inv("2026-10", "draft")]), { month: "2026-10", carriedFrom: null });
  assert.equal(carriedNote("Missed bonus", "2026-10"), "Missed bonus (carried from October 2026)");

  // The carried adjustment lands on November's lines.
  const t = adjustmentTarget("2026-10", invoices);
  const adj: Adjustment = { month: t.month, amount_cents: 1500, note: carriedNote("Missed bonus", t.carriedFrom!) };
  const s = monthSummary({ start_date: "2026-09-01", starting_completed_months: 0 }, "2026-11", [], [], [], [adj], { invoices });
  assert.deepEqual(s.adjustmentLines, [{ kind: "adjustment", label: "Missed bonus (carried from October 2026)", amount_cents: 1500 }]);
});

// ---------------------------------------------------------------- bonus claim approval

const claim = (over: Partial<BonusClaim> = {}): BonusClaim => ({
  video_url: "https://www.tiktok.com/@jen/video/7550000000000000001",
  platform: "tiktok",
  posted_on: "2026-10-05",
  views_claimed: 140_000,
  status: "claimed",
  claimed_at: "2026-10-12T18:00:00Z",
  ...over,
});

test("approving a claim records the milestone date, so it pays (approved claim -> invoice line)", () => {
  // Approved with only {status: "approved"}: before the fix, no date meant $0.
  const bare = { ...claim(), status: "approved" as const };
  assert.deepEqual(bonusLinesForMonth([bare], "2026-10"), []);

  const dated = { ...bare, ...approvedClaimDates(bare, "America/Chicago") };
  assert.equal(dated.crossed_100k_on, "2026-10-12");
  const lines = bonusLinesForMonth([dated], "2026-10");
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, "bonus_100k");
  assert.equal(lines[0].amount_cents, 1500);

  // A 1M claim is the whole $100.
  const big = { ...claim({ views_claimed: 1_200_000 }), status: "approved" as const };
  const bigDated = { ...big, ...approvedClaimDates(big, "America/Chicago") };
  assert.deepEqual(approvedClaimDates(big, "America/Chicago"), { crossed_1m_on: "2026-10-12" });
  assert.equal(bonusLinesForMonth([bigDated], "2026-10")[0].amount_cents, 10000);
});

test("approval dates: kept when set, inside the 30-day window, nothing under 100K", () => {
  assert.deepEqual(approvedClaimDates(claim({ crossed_100k_on: "2026-10-07" }), "UTC"), {});
  assert.deepEqual(approvedClaimDates(claim({ views_claimed: 90_000 }), "UTC"), {});
  // Sent 40 days after posting: dated the window's last day so the approval still pays.
  assert.deepEqual(approvedClaimDates(claim({ claimed_at: "2026-11-14T12:00:00Z" }), "UTC"), { crossed_100k_on: "2026-11-04" });
  // No claimed_at: the posting day.
  assert.deepEqual(approvedClaimDates(claim({ claimed_at: undefined }), "UTC"), { crossed_100k_on: "2026-10-05" });
});

// ---------------------------------------------------------------- final pay / bank

test("final pay: unpaid invoices + the open end month; trial pay left after Don't continue", () => {
  const invoices = [inv("2026-09", "paid", { total_cents: 15000 }), inv("2026-10", "submitted", { total_cents: 30000, submitted_at: "2026-11-01T09:00:00.000Z" })];
  // Ended Oct 14, October already invoiced: $300 by Nov 8.
  assert.deepEqual(finalPayFor("2026-10-14", invoices, 99999), { cents: 30000, payBy: "2026-11-08" });
  // Ended Oct 14, October not invoiced yet: the open month, paid by Nov 8.
  assert.deepEqual(finalPayFor("2026-10-14", [inv("2026-09", "paid", { total_cents: 15000 })], 16500), { cents: 16500, payBy: "2026-11-08" });
  assert.deepEqual(finalPayFor("2026-10-14", [inv("2026-10", "paid", { total_cents: 300 })], 0), { cents: 0, payBy: null });

  const paidTrial = [inv("2026-09", "paid", { lines: [{ kind: "trial", label: "Trial", amount_cents: 12000 }] })];
  assert.equal(unpaidTrialCents(20, 1500, paidTrial), 18000);
  assert.equal(unpaidTrialCents(20, 1500, []), 30000);
});

test("bank label", () => {
  assert.equal(bankLabel({ status: "submitted", last4: "1234" }), "Bank ••1234");
  assert.equal(bankLabel({ status: "missing", last4: null }), "No bank details");
  assert.equal(bankLabel({ status: "submitted", last4: null }), "Bank details in");
  assert.equal(bankLabel(null), "No bank details");
});

// ---------------------------------------------------------------- offboarding / reactivation

const NOW = new Date("2026-10-14T18:00:00Z");

test("offboarding: status ended, ended_on kept or today (their zone), password task only with accounts", () => {
  const u = planOffboard({ status: "trial", timezone: "America/Los_Angeles", tiktok_handle: "jen.keshah" }, "removed", NOW);
  assert.equal(u.status, "ended");
  assert.equal(u.ended_on, "2026-10-14");
  assert.equal(u.offboarded_at, NOW.toISOString());
  assert.equal((u.offboard as { passwords_reset_needed: boolean }).passwords_reset_needed, true);
  assert.equal((u.offboard as { reason: string }).reason, "removed");

  const kept = planOffboard({ status: "ended", ended_on: "2026-10-09" }, "trial", NOW);
  assert.equal(kept.ended_on, "2026-10-09");
  assert.equal(kept.status, undefined); // already ended
  assert.equal((planOffboard({ status: "onboarding" }, "withdrawn", NOW).offboard as { passwords_reset_needed: boolean }).passwords_reset_needed, false);
  assert.equal(planOffboard({ status: "active" }, "status", NOW, { endedOn: "2026-10-31" }).ended_on, "2026-10-31");

  assert.equal(passwordsResetPending({ offboarded_at: "x", offboard: { passwords_reset_needed: true, passwords_reset_at: null } }), true);
  assert.equal(passwordsResetPending({ offboarded_at: "x", offboard: { passwords_reset_needed: true, passwords_reset_at: "y" } }), false);
  assert.equal(passwordsResetPending({ offboarded_at: "x", offboard: { passwords_reset_needed: false } }), false);
  assert.equal(isOffboarded({ status: "ended" }), true);
  assert.equal(isOffboarded({ status: "cut" }), true);
  assert.equal(isOffboarded({ status: "active" }), false);
});

test("accepting an ended / cut email again reuses the doc as a fresh offer", () => {
  assert.equal(shouldReactivate({ status: "ended", is_active: true }), true);
  assert.equal(shouldReactivate({ status: "cut", is_active: false }), true);
  assert.equal(shouldReactivate({ status: "active", is_active: false }), true);
  assert.equal(shouldReactivate({ status: "onboarding", is_active: true }), false);
  assert.equal(shouldReactivate({ status: "active" }), false);

  const old = {
    status: "ended",
    is_active: false,
    ended_on: "2026-09-30",
    withdrawn_at: "2026-09-30T12:00:00Z",
    offboarded_at: "2026-09-30T12:00:00Z",
    offboard: { reason: "withdrawn" },
    trial_plan: "v2",
    trial_outcome: "end",
    trial_completed_on: "2026-09-29",
    start_date: "2026-09-01",
    accepted_at: "2026-08-28T00:00:00Z",
    accept: { steps: { group: { status: "done" } } },
    contract: { status: "signed", signed_at: "2026-08-29T00:00:00Z", pdf_path: "creators/x/contract.pdf" },
    contract_deadline_at: "2026-08-31T03:59:00Z",
    legal_name: "Jen Smith",
    timezone: "America/Chicago",
    keshah_email: "jen@keshah.com",
  };
  const u = planReactivate(old, { legal_name: "Jennifer Smith", timezone: "America/New_York", application_id: "app2" }, NOW);
  assert.equal(u.is_active, true);
  assert.equal(u.status, "onboarding");
  assert.equal(u.start_date, null);
  assert.equal(u.start_mode, "first_post");
  assert.deepEqual(u.contract, { status: "none" });
  assert.equal(u.application_id, "app2");
  assert.equal(u.reactivated_at, NOW.toISOString());
  // Old run's dates cleared, so accept starts over (deadline, v2 trial, welcome email, contract).
  for (const k of ["ended_on", "withdrawn_at", "offboarded_at", "offboard", "trial_plan", "trial_outcome", "trial_completed_on", "accepted_at", "accept", "contract_deadline_at"]) {
    assert.ok(u[k] instanceof FieldValue, `${k} should be deleted`);
  }
  // Their name, zone and inbox stay as they were.
  assert.equal(u.legal_name, undefined);
  assert.equal(u.timezone, undefined);
  assert.equal(u.keshah_email, undefined);
  assert.ok(u.previous_runs instanceof FieldValue);
});

// ---------------------------------------------------------------- nudges

const c = (over: Record<string, unknown> = {}) => ({ is_active: true, status: "trial", timezone: "America/Chicago", start_date: "2026-10-05", ...over });
// Wednesday Oct 14, 8:10 PM Chicago.
const EVE = new Date("2026-10-15T01:10:00Z");

test("posting nudge: 8 PM on scheduled days only, and on the first posting day before start_date is set", () => {
  const sched = () => true;
  assert.equal(postingNudgeDate(c(), EVE, { firstDay: null, lastNudgeDate: null, scheduled: sched }), "2026-10-14");
  assert.equal(postingNudgeDate(c(), EVE, { firstDay: null, lastNudgeDate: "2026-10-14", scheduled: sched }), null);
  // Not a scheduled day (trial done and waiting, gap before promotion...).
  assert.equal(postingNudgeDate(c(), EVE, { firstDay: null, lastNudgeDate: null, scheduled: () => false }), null);
  // 7 PM: not yet.
  assert.equal(postingNudgeDate(c(), new Date("2026-10-15T00:10:00Z"), { firstDay: null, lastNudgeDate: null, scheduled: sched }), null);
  // Onboarded, no start_date yet: from the first posting day.
  assert.equal(postingNudgeDate(c({ start_date: "" }), EVE, { firstDay: "2026-10-14", lastNudgeDate: null, scheduled: sched }), "2026-10-14");
  assert.equal(postingNudgeDate(c({ start_date: "" }), EVE, { firstDay: "2026-10-15", lastNudgeDate: null, scheduled: sched }), null);
  assert.equal(postingNudgeDate(c({ start_date: "" }), EVE, { firstDay: null, lastNudgeDate: null, scheduled: sched }), null);
  assert.equal(postingNudgeDate(c({ status: "onboarding" }), EVE, { firstDay: null, lastNudgeDate: null, scheduled: sched }), null);
  assert.equal(postingNudgeDate(c({ ended_on: "2026-10-13" }), EVE, { firstDay: null, lastNudgeDate: null, scheduled: sched }), null);
});

test("first-day eve and warm-up reminders", () => {
  assert.equal(firstDayEveDate(c({ start_date: "" }), EVE, "2026-10-15", null), "2026-10-14");
  assert.equal(firstDayEveDate(c({ start_date: "" }), EVE, "2026-10-15", "2026-10-14"), null);
  assert.equal(firstDayEveDate(c({ start_date: "" }), EVE, "2026-10-19", null), null);
  assert.equal(firstDayEveDate(c(), EVE, "2026-10-15", null), null); // already started

  const six = new Date("2026-10-14T23:05:00Z"); // 6:05 PM Chicago
  // One warm-up day (WARMUP_DAYS = 1): nudged until it's ticked.
  const onb = { accounts_done_at: "2026-10-12T00:00:00Z", warmup_days: [] as string[] };
  assert.equal(warmupNudgeDate(c({ status: "onboarding" }), six, onb, null), "2026-10-14");
  assert.equal(warmupNudgeDate(c({ status: "onboarding" }), six, { ...onb, warmup_days: ["2026-10-14"] }, null), null);
  assert.equal(warmupNudgeDate(c({ status: "onboarding" }), six, { ...onb, warmup_days: ["a"] }, null), null);
  assert.equal(warmupNudgeDate(c({ status: "onboarding" }), six, { warmup_days: [] }, null), null); // no accounts yet
  assert.equal(warmupNudgeDate(c({ status: "onboarding" }), six, onb, "2026-10-14"), null);
  assert.equal(warmupNudgeDate(c({ status: "onboarding" }), EVE, onb, null), null); // 8 PM, not 6

  assert.equal(syncIsFresh("2026-10-15T00:50:00Z", EVE), true);
  assert.equal(syncIsFresh("2026-10-15T00:30:00Z", EVE), false);
  assert.equal(syncIsFresh(null, EVE), false);
});

test("phoneCheckPending: only while leaving, until done, never after offboarding", () => {
  assert.equal(phoneCheckPending({ status: "leaving" }), true);
  assert.equal(phoneCheckPending({ status: "leaving", phone_removed_at: "2026-10-12" }), false);
  assert.equal(phoneCheckPending({ status: "leaving", offboarded_at: "x" }), false);
  assert.equal(phoneCheckPending({ status: "active" }), false);
});
