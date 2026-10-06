// Run: npx tsx --test lib/creators/signature.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptedSignatureText } from "./signature";

test("all lowercase becomes Title Case", () => {
  assert.equal(adoptedSignatureText("maria gomez"), "Maria Gomez");
  assert.equal(adoptedSignatureText("  maria   gomez "), "Maria Gomez");
});

test("all uppercase becomes Title Case", () => {
  assert.equal(adoptedSignatureText("MARIA GOMEZ"), "Maria Gomez");
});

test("mixed case is kept exactly as typed", () => {
  assert.equal(adoptedSignatureText("Maria Gomez"), "Maria Gomez");
  assert.equal(adoptedSignatureText("Ryan McDonald"), "Ryan McDonald");
  assert.equal(adoptedSignatureText("maria Gomez"), "maria Gomez");
  assert.equal(adoptedSignatureText("DeShawn van der Berg"), "DeShawn van der Berg");
});

test("hyphens, apostrophes and accents", () => {
  assert.equal(adoptedSignatureText("mary-jane o'neil"), "Mary-Jane O'Neil");
  assert.equal(adoptedSignatureText("JOSÉ ÁLVAREZ"), "José Álvarez");
  assert.equal(adoptedSignatureText("j. r. smith"), "J. R. Smith");
});

test("no letters: returned squashed, unchanged", () => {
  assert.equal(adoptedSignatureText(" 123  45 "), "123 45");
  assert.equal(adoptedSignatureText(""), "");
});
