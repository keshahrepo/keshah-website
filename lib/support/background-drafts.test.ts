// Run: npx tsx --test lib/support/background-drafts.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CLAIM_TTL_MS,
  candidateFromDoc,
  draftCoversLatest,
  needsDraft,
  selectConversationsToDraft,
  type DraftCandidate,
} from "./background-drafts";

const NOW = 1_800_000_000_000;
const ts = (ms: number) => ({ toMillis: () => ms });

function convo(userId: string, o: Partial<DraftCandidate> & { lastMs?: number; fromId?: string } = {}): DraftCandidate {
  const lastMs = o.lastMs ?? NOW - 60_000;
  return {
    userId,
    lastMessage: { fromId: o.fromId ?? "user1", timestamp: ts(lastMs) },
    lastUpdateAt: ts(lastMs),
    draft: o.draft ?? null,
    skipUntil: o.skipUntil ?? null,
    draftClaim: o.draftClaim ?? null,
  };
}

test("no draft -> needs one", () => {
  assert.equal(needsDraft(convo("a"), NOW), true);
});

test("draft generated for the latest message -> skipped", () => {
  const c = convo("a", { lastMs: NOW - 5000, draft: { generated_at: ts(NOW - 1000), for_message_ms: NOW - 5000 } });
  assert.equal(needsDraft(c, NOW), false);
});

test("user wrote again after the draft -> redraft", () => {
  const c = convo("a", { lastMs: NOW - 1000, draft: { generated_at: ts(NOW - 2000), for_message_ms: NOW - 9000 } });
  assert.equal(needsDraft(c, NOW), true);
});

test("legacy draft without for_message_ms falls back to generated_at", () => {
  assert.equal(draftCoversLatest({ generated_at: ts(NOW - 100) }, NOW - 500), true);
  assert.equal(draftCoversLatest({ generated_at: ts(NOW - 900) }, NOW - 500), false);
});

test("last message from Aadi -> not waiting, no draft", () => {
  assert.equal(needsDraft(convo("a", { fromId: "0" }), NOW), false);
});

test("snoozed conversation -> skipped until the snooze ends", () => {
  assert.equal(needsDraft(convo("a", { skipUntil: ts(NOW + 3600_000) }), NOW), false);
  assert.equal(needsDraft(convo("a", { skipUntil: ts(NOW - 1) }), NOW), true);
});

test("fresh claim blocks, expired claim is reclaimable", () => {
  assert.equal(needsDraft(convo("a", { draftClaim: { at: ts(NOW - 30_000) } }), NOW), false);
  assert.equal(needsDraft(convo("a", { draftClaim: { at: ts(NOW - CLAIM_TTL_MS - 1) } }), NOW), true);
});

test("selection: oldest waiting first, capped, filtered", () => {
  const list = [
    convo("newest", { lastMs: NOW - 1000 }),
    convo("oldest", { lastMs: NOW - 90_000 }),
    convo("replied", { lastMs: NOW - 100_000, fromId: "0" }),
    convo("drafted", { lastMs: NOW - 95_000, draft: { generated_at: ts(NOW - 10), for_message_ms: NOW - 95_000 } }),
    convo("middle", { lastMs: NOW - 50_000 }),
  ];
  assert.deepEqual(selectConversationsToDraft(list, NOW).map((c) => c.userId), ["oldest", "middle", "newest"]);
  assert.deepEqual(selectConversationsToDraft(list, NOW, 2).map((c) => c.userId), ["oldest", "middle"]);
});

test("selection caps at 10 by default", () => {
  const many = Array.from({ length: 25 }, (_, k) => convo(`u${k}`, { lastMs: NOW - k * 1000 }));
  const picked = selectConversationsToDraft(many, NOW);
  assert.equal(picked.length, 10);
  assert.equal(picked[0].userId, "u24");
});

test("candidateFromDoc reads the support doc shape", () => {
  const c = candidateFromDoc("x", {
    last_message: { fromId: "x", timestamp: ts(NOW - 10) },
    last_update_at: ts(NOW - 10),
    last_draft: { generated_at: ts(NOW - 20), for_message_ms: NOW - 30 },
  });
  assert.ok(c);
  assert.equal(needsDraft(c!, NOW), true);
  assert.equal(candidateFromDoc("y", {}), null);
});
