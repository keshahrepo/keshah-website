import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanCountry, storedSummary, summarize } from "./stripe-connect";

const acct = (o: Record<string, unknown>) =>
  ({ details_submitted: true, payouts_enabled: true, country: "US", requirements: { currently_due: [], past_due: [] }, external_accounts: { data: [{ object: "bank_account", bank_name: "CHASE", last4: "4821" }] }, ...o }) as never;

test("summarize: ready, pending, needs info", () => {
  assert.deepEqual(summarize(acct({})), { status: "ready", bank_name: "CHASE", last4: "4821", country: "US" });
  assert.equal(summarize(acct({ payouts_enabled: false })).status, "pending");
  assert.equal(summarize(acct({ details_submitted: false, payouts_enabled: false })).status, "needs_info");
  assert.equal(summarize(acct({ requirements: { currently_due: ["individual.ssn_last_4"], past_due: [] } })).status, "needs_info");
});

test("storedSummary and cleanCountry", () => {
  assert.equal(storedSummary(undefined).status, "none");
  assert.equal(storedSummary({ stripe_account_id: "acct_1", stripe: { status: "ready", last4: "1" } }).status, "ready");
  assert.equal(cleanCountry("es"), "ES");
  assert.equal(cleanCountry("Spain"), null);
});
