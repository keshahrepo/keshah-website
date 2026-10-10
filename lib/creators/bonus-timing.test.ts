// Run: npx tsx --test lib/creators/bonus-timing.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { announceEnabled, bonusTimingPush, oldRuleBonusCents, runBonusTimingAnnouncement } from "./bonus-timing";

test("announcement copy matches the app card", () => {
  const m = bonusTimingPush(74000);
  assert.equal(m.title, "Bonuses now come sooner");
  assert.equal(
    m.body,
    "When a video hits 100K or 1M views, the bonus now comes on your next payday instead of a month later. Your September bonuses ($740) still come on Nov 1.",
  );
  assert.ok(!m.body.includes("—"));
});

test("old-rule cents: lines without a rule are old; new lines don't count", () => {
  assert.equal(
    oldRuleBonusCents([
      { kind: "bonus_100k", label: "x", amount_cents: 1500 },
      { kind: "bonus_1m", label: "y", amount_cents: 10000, rule: "old" },
      { kind: "bonus_100k", label: "z", amount_cents: 1500, rule: "new" },
      { kind: "base", label: "b", amount_cents: 50000 },
    ]),
    11500,
  );
});

test("off unless the flag is 1; sends once per creator; dry sends nothing", async () => {
  assert.equal(announceEnabled({}), false);
  assert.equal(announceEnabled({ BONUS_TIMING_ANNOUNCE_ENABLED: "1" }), true);
  const sent = new Set<string>();
  const pushes: string[] = [];
  const deps = {
    listCreators: async () => [
      { id: "isai", name: "Isai", email: "i@x.com" },
      { id: "jen", name: "Jen", email: "j@x.com" },
    ],
    oldRuleDue: async (id: string) => (id === "isai" ? 74000 : 0),
    alreadySent: async (id: string) => sent.has(id),
    markSent: async (id: string) => void sent.add(id),
    push: async (t: { creatorId: string }) => void pushes.push(t.creatorId),
  };
  const dry = await runBonusTimingAnnouncement(deps, { dry: true });
  assert.deepEqual(dry.map((r) => r.id), ["isai"]);
  assert.equal(pushes.length, 0);
  assert.deepEqual((await runBonusTimingAnnouncement(deps)).map((r) => r.result), ["sent"]);
  assert.deepEqual((await runBonusTimingAnnouncement(deps)).map((r) => r.result), ["already sent"]);
  assert.deepEqual(pushes, ["isai"]);
});
