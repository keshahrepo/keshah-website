// Run: npx tsx --test lib/support/billing-policy.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CANONICAL_ANSWERS, DEFAULT_CATEGORY_RULES } from "./prompts";
import { applyBillingPolicy, BILLING_CANONICAL_BLOCK, BILLING_CANONICAL_START, BILLING_CATEGORY_BLOCK, BILLING_CATEGORY_START } from "./billing-policy";

test("default prompts carry the refund / cancel answers", () => {
  const a = DEFAULT_CANONICAL_ANSWERS;
  assert.match(a, /Payments for KESHAH are handled by Apple \(or Google on Android\), so we don't have a way to issue refunds on our end/);
  assert.match(a, /The free trial turns into a subscription automatically unless it's cancelled before it ends/);
  assert.match(a, /On iPhone: Settings, tap your name, Subscriptions, KESHAH, Cancel/);
  assert.match(a, /On Android: Play Store, your profile, Payments & subscriptions, Subscriptions, KESHAH, Cancel/);
  assert.match(a, /I'm sorry you're frustrated/);
  assert.match(a, /Never promise a refund/);
  assert.match(a, /NEVER give step-by-step refund instructions/);
  assert.ok(!BILLING_CANONICAL_BLOCK.includes("—") && !BILLING_CATEGORY_BLOCK.includes("—"), "no em dashes in the billing blocks");
});

test("escalated rule: chargebacks / legal / declined refunds", () => {
  assert.match(DEFAULT_CANONICAL_ANSWERS, /ESCALATED: chargeback or bank dispute/);
  assert.match(DEFAULT_CANONICAL_ANSWERS, /Apple Support directly by phone or chat/);
  assert.match(DEFAULT_CANONICAL_ANSWERS, /Never admit liability, never promise a refund, never give legal advice/);
  assert.match(DEFAULT_CATEGORY_RULES, /- "escalated": chargeback or bank dispute/);
});

test("default category rules: app refunds answerable, kit refunds account_change", () => {
  const r = DEFAULT_CATEGORY_RULES;
  assert.match(r, /refunds, "charged after the free trial", "forgot to cancel", and cancel requests are "answerable"/);
  assert.match(r, /- "account_change": physical regrowth kit refund/);
  assert.ok(!/- "account_change": refund, plan switch, cancel subscription/.test(r));
});

test("applyBillingPolicy splices into an edited live doc, keeps the rest, idempotent", () => {
  const live = {
    canonicalAnswers: "COMMON QUESTIONS\n1. founder edit here",
    categoryRules:
      '- "answerable": stuff\n- "account_change": refund, plan switch, cancel subscription, change email, delete account. Holding reply.\n- "thanks": founder tweak',
  };
  const once = applyBillingPolicy(live);
  assert.equal(once.changed, true);
  assert.ok(once.canonicalAnswers.startsWith("COMMON QUESTIONS\n1. founder edit here"));
  assert.ok(once.canonicalAnswers.includes(BILLING_CANONICAL_START));
  assert.ok(once.categoryRules.includes('- "thanks": founder tweak'));
  assert.ok(once.categoryRules.includes(BILLING_CATEGORY_START));
  assert.ok(!once.categoryRules.includes("cancel subscription, change email"));
  const twice = applyBillingPolicy(once);
  assert.equal(twice.changed, false);
  assert.equal(twice.canonicalAnswers, once.canonicalAnswers);
  assert.equal(twice.categoryRules, once.categoryRules);
});

test("defaults are already up to date with the policy", () => {
  assert.equal(applyBillingPolicy({ canonicalAnswers: DEFAULT_CANONICAL_ANSWERS, categoryRules: DEFAULT_CATEGORY_RULES }).changed, false);
});
