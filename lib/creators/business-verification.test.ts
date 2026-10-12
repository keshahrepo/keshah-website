import assert from "node:assert/strict";
import test from "node:test";
import { MAX_IMAGE_B64, sanitizeBusinessInput } from "./business-verification";

test("sanitizeBusinessInput: trims fields, strips a data: prefix, refuses junk and oversize images", () => {
  const ok = sanitizeBusinessInput({ address_line: " 131 Continental Dr ", county: "New Castle", image_b64: "data:image/jpeg;base64,/9j/4AAQ==" });
  assert.deepEqual(ok, { updates: { address_line: "131 Continental Dr", county: "New Castle", image_b64: "/9j/4AAQ==" } });
  assert.ok("error" in sanitizeBusinessInput({ image_b64: "" }));
  assert.ok("error" in sanitizeBusinessInput({ image_b64: "not base64!" }));
  assert.ok("error" in sanitizeBusinessInput({ image_b64: "A".repeat(MAX_IMAGE_B64 + 1) }));
  assert.deepEqual(sanitizeBusinessInput({}), { updates: {} });
});
