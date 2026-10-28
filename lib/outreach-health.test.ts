import { test } from "node:test";
import assert from "node:assert/strict";
import { reasonOf, warningsOf } from "./outreach-health";

const at = (iso: string) => new Date(iso);
const base = { health: {}, paused: false, queued: 40, sentToday: 0, cap: 25 };

test("warningsOf: quiet when all is well", () => {
  assert.deepEqual(warningsOf({ ...base, now: at("2026-10-28T14:00:00Z") }), []); // Wed 10 AM ET, before sending
  assert.deepEqual(warningsOf({ ...base, sentToday: 25, queued: 30, now: at("2026-10-28T17:00:00Z") }), []);
});

test("warningsOf: errors, paused, nothing by noon, short for the next batch", () => {
  const w = (o: Partial<typeof base> & { now: Date }) => warningsOf({ ...base, ...o }).map((x) => `${x.level}:${x.text}`);
  assert.ok(w({ health: { send: { error: "Gmail rejected the password" } } as any, now: at("2026-10-28T14:00:00Z") })[0].startsWith("red:Sending stopped: Gmail"));
  assert.ok(w({ health: { search: { error: "ScrapeCreators is out of credits" } } as any, now: at("2026-10-28T14:00:00Z") })[0].startsWith("red:Search isn't running"));
  assert.ok(w({ paused: true, now: at("2026-10-28T17:00:00Z") })[0].startsWith("amber:Paused"));
  assert.deepEqual(w({ now: at("2026-10-28T16:30:00Z") }), ["red:Nothing has gone out today"]); // 12:30 PM ET
  assert.deepEqual(w({ sentToday: 25, queued: 10, now: at("2026-10-28T23:00:00Z") }), ["amber:Only 10 ready for the next batch (the search is still filling it)"]); // 7 PM ET
});

test("reasonOf: plain reasons", () => {
  assert.equal(reasonOf(new Error("Invalid login: 535-5.7.8 Username and Password not accepted")), "Gmail rejected the password");
  assert.equal(reasonOf(new Error("ScrapeCreators 402: insufficient credits")), "ScrapeCreators is out of credits");
});
