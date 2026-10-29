// Run: npx tsx --test lib/creators/plans.test.ts
// The Oct 2026 plans: $30 trial days, then Lite (3 a day, $600), Full (5, $1,000)
// or Format creator (custom base). Flat base, no ladder.
import { test } from "node:test";
import assert from "node:assert/strict";
import { draftInvoiceLines, monthSummary, nextLevel, planBaseCents, planFieldsOf, planVideos, trialStatus, videosRequiredOn, weekdaysBetween } from "./pay";
import type { PayProfile, PostingDay } from "./types";

const vids = (n: number) => Array.from({ length: n }, (_, i) => ({ tiktok_url: `https://www.tiktok.com/@x/video/${i}`, instagram_url: `https://www.instagram.com/reel/${i}` }));
const day = (date: string, n: number): PostingDay => ({ date, videos: vids(n), logged_at: `${date}T20:00:00Z` });
const trialOct = () => weekdaysBetween("2026-10-01", "2026-10-28").map((d) => day(d, 3));
const prof = (extra: Partial<PayProfile>): PayProfile => ({ start_date: "2026-10-01", starting_completed_months: 0, trial_plan: "v2", trial_day_cents: 3000, ...extra });

test("trial days pay the profile's own rate ($30)", () => {
  const pd = weekdaysBetween("2026-10-01", "2026-10-09").map((d) => day(d, 3));
  const s = monthSummary(prof({ pay_plan: "full" }), "2026-10", pd, [], [], [], { today: "2026-10-12" });
  assert.equal(s.trialCents, 7 * 3000);
  assert.match(draftInvoiceLines(s)[0].label, /at \$30(\.00)?\/day/);
  const t = trialStatus(pd, prof({ pay_plan: "full" }));
  assert.equal(t.dayCents, 3000);
  assert.equal(t.totalCents, 60000);
});

test("Lite: 3 videos a day count after the trial, $600 flat base", () => {
  const p = prof({ pay_plan: "lite", trial_outcome: "keep", trial_decided_on: "2026-10-28" }); // full plan from Oct 29
  assert.equal(videosRequiredOn(p, trialOct(), "2026-11-02"), 3);
  const nov = weekdaysBetween("2026-11-02", "2026-11-30").map((d) => day(d, 3));
  const s = monthSummary(p, "2026-11", [...trialOct(), ...nov], [], [], [], { today: "2026-12-01" });
  assert.equal(s.levelBaseCents, 60000);
  assert.equal(s.baseDueCents, 60000);
  assert.deepEqual(nextLevel(p, { postingDays: [...trialOct(), ...nov], daysOff: [] }, "2026-11"), { nextBaseCents: null, monthsNeeded: null, earliestMonth: null });
});

test("Full: 5 a day, $1,000; Format: custom base (default $1,200)", () => {
  assert.equal(planVideos({ pay_plan: "full" }), 5);
  assert.equal(planBaseCents({ pay_plan: "full" }), 100000);
  assert.equal(planBaseCents({ pay_plan: "format", custom_base_cents: 150000 }), 150000);
  assert.equal(planBaseCents({ pay_plan: "format" }), 120000);
  const p = prof({ pay_plan: "full", trial_outcome: "keep", trial_decided_on: "2026-10-28" });
  const nov3 = weekdaysBetween("2026-11-02", "2026-11-30").map((d) => day(d, 3));
  // 3 videos isn't a full day on Full
  assert.equal(monthSummary(p, "2026-11", [...trialOct(), ...nov3], [], [], [], { today: "2026-12-01" }).baseDueCents, 0);
});

test("no plan: the original ladder and 5 a day, unchanged", () => {
  assert.equal(planBaseCents({}), null);
  assert.equal(planVideos({}), 5);
  const s = monthSummary({ start_date: "2026-09-01", starting_completed_months: 0 }, "2026-11", weekdaysBetween("2026-11-02", "2026-11-30").map((d) => day(d, 5)), [], [], [], { today: "2026-12-01" });
  assert.equal(s.levelBaseCents, 65000);
});

test("planFieldsOf keeps only valid values", () => {
  assert.deepEqual(planFieldsOf({ pay_plan: "full", trial_day_cents: 3000 }), { pay_plan: "full", trial_day_cents: 3000 });
  assert.deepEqual(planFieldsOf({ pay_plan: "gold", custom_base_cents: -1, trial_day_cents: "x" }), {});
});

import { APP_CTA, BIO_CTA, PINNED_CTA, ctaFor } from "./proven-db";

test("endings: the proven pinned-video ending unless the creator tests the bio one; 3-step scripts keep theirs", () => {
  const v = { cta_line: "It's all in my pinned video." } as Parameters<typeof ctaFor>[1];
  assert.equal(ctaFor({}, v).cta_line, PINNED_CTA);
  assert.equal(ctaFor({ cta_style: "pinned" }, v).cta_line, PINNED_CTA);
  assert.equal(ctaFor({ cta_style: "bio" }, v).cta_line, BIO_CTA);
  assert.equal(ctaFor({ cta_style: "app" }, v).cta_line, APP_CTA);
  const lined = { ...v, lines: [{ text: "x" }] } as Parameters<typeof ctaFor>[1];
  assert.equal(ctaFor({ cta_style: "bio" }, lined).cta_line, "It's all in my pinned video.");
});

test("the first-day pinned video (a founder-counted day) is a paid trial day", () => {
  const pinnedDay: PostingDay = { date: "2026-10-01", videos: [], logged_at: "2026-10-01T20:00:00Z", counted_by_founder: "Pinned video sent for review" } as PostingDay;
  const rest = weekdaysBetween("2026-10-02", "2026-10-09").map((d) => day(d, 3));
  const s = monthSummary(prof({ pay_plan: "full" }), "2026-10", [pinnedDay, ...rest], [], [], [], { today: "2026-10-12" });
  assert.equal(s.trialDays, 7);
  assert.equal(s.trialCents, 7 * 3000);
});
