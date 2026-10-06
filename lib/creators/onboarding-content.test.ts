import { test } from "node:test";
import assert from "node:assert/strict";
import { QUIZ, suggestedHandle } from "./onboarding-content";

test("suggestedHandle: first name, lowercase, a to z only, then .keshah", () => {
  assert.equal(suggestedHandle("Jen Rivera"), "jen.keshah");
  assert.equal(suggestedHandle("  José  María "), "jose.keshah");
  assert.equal(suggestedHandle("Mary-Ann O'Neil"), "maryann.keshah");
  assert.equal(suggestedHandle("Zoë"), "zoe.keshah");
  assert.equal(suggestedHandle(""), "yourname.keshah");
  assert.equal(suggestedHandle("李"), "yourname.keshah");
});

test("quiz: every correct index points at a real option", () => {
  for (const q of QUIZ) assert.ok(q.correct >= 0 && q.correct < q.options.length, q.id);
  const blood = QUIZ.find((q) => q.id === "blood");
  assert.equal(blood?.options[blood.correct], "The hair gets weaker and falls out");
});
