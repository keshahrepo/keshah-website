// Run: npx tsx --test lib/creators/link-pool.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { freeCount, pickLink, type PooledLink } from "./link-pool";

const pool: PooledLink[] = [
  { url: "https://appstack.link/a", campaign: "creator_01", assigned_to: "x" },
  { url: "https://appstack.link/b", campaign: "creator_02" },
  { url: "https://appstack.link/c", campaign: "creator_03" },
];

test("a new creator gets the first free link", () => {
  assert.equal(pickLink(pool, "new"), 1);
});

test("a creator who already holds a link gets the same one back", () => {
  assert.equal(pickLink(pool, "x"), 0);
});

test("no free link: -1", () => {
  assert.equal(pickLink(pool.map((l) => ({ ...l, assigned_to: "y" })), "new"), -1);
  assert.equal(pickLink([], "new"), -1);
});

test("free links are counted", () => {
  assert.equal(freeCount(pool), 2);
});
