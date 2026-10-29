import { test } from "node:test";
import assert from "node:assert/strict";
import { appendCallNote, cleanCallNotes } from "./call-notes";

test("call notes: appended with a blank line, trimmed, capped", () => {
  assert.equal(appendCallNote("", " Great energy "), "Great energy");
  assert.equal(appendCallNote("Great energy", "Busy on Mondays"), "Great energy\n\nBusy on Mondays");
  assert.equal(appendCallNote("Kept", "   "), "Kept");
  assert.equal(cleanCallNotes("x".repeat(9000)).length, 8000);
});
