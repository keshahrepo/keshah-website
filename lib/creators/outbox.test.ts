import { test } from "node:test";
import assert from "node:assert/strict";
import { fillName } from "./outbox";

test("outbox: {first} becomes the creator's first name", () => {
  assert.equal(fillName("Hi {first},", "Kadin Smith"), "Hi Kadin,");
  assert.equal(fillName("Hi {first},", ""), "Hi there,");
});
