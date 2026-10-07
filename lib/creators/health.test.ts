import { test } from "node:test";
import assert from "node:assert/strict";
import { healthProblems } from "./health";

const NOW = Date.parse("2026-10-08T14:00:00Z"); // Thursday

test("healthProblems: quiet when all is well", () => {
  const creators = [{ name: "Isai", status: "active", start_date: "2026-10-05", post_sync: { last_ok_at: "2026-10-08T12:00:00Z", consecutive_failures: 0, credits_remaining: 5000 }, newest_post_at: "2026-10-08T01:00:00Z" }];
  const proven = Array.from({ length: 50 }, () => ({ status: "active", talking_points: ["a"] }));
  assert.deepEqual(healthProblems(creators, proven, NOW), []);
});

test("healthProblems: low credits, failing sync, no posts, small library, stuck beats", () => {
  const creators = [{ name: "Isai", status: "trial", start_date: "2026-10-01", post_sync: { last_ok_at: "2026-10-08T12:00:00Z", consecutive_failures: 3, credits_remaining: 900 }, newest_post_at: "2026-10-02T01:00:00Z" }];
  const proven = [
    ...Array.from({ length: 10 }, () => ({ status: "active", talking_points: ["a"] })),
    { status: "active", transcript: "x".repeat(100), beats: { attempts: 3 } },
  ];
  const p = healthProblems(creators, proven, NOW);
  assert.equal(p.length, 5, p.join("\n"));
  assert.match(p[0], /credits are low: 900/);
});
