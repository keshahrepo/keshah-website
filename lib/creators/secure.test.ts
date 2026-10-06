// Run: npx tsx --test lib/creators/secure.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import {
  DecryptError,
  KEY_ENV,
  PaymentsDisabledError,
  encryptionConfigured,
  openBuffer,
  openFile,
  openJson,
  parseKey,
  sealBuffer,
  sealFile,
  sealJson,
} from "./secure";

const KEY = randomBytes(32);
const OTHER = randomBytes(32);

test("JSON round trip, fresh IV each time", () => {
  const value = { routing_number: "021000021", account_number: "123456789", nested: { a: [1, 2] } };
  const a = sealJson(value, "bank:c1", KEY);
  const b = sealJson(value, "bank:c1", KEY);
  assert.equal(a.v, 1);
  assert.equal(Buffer.from(a.iv, "base64").length, 12);
  assert.equal(Buffer.from(a.tag, "base64").length, 16);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.ct, b.ct);
  assert.ok(!JSON.stringify(a).includes("123456789"));
  assert.deepEqual(openJson(a, "bank:c1", KEY), value);
});

test("file round trip", () => {
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(50_000)]);
  const body = sealFile(pdf, "tax:c1", KEY);
  assert.ok(!body.includes(Buffer.from("%PDF")));
  assert.ok(openFile(body, "tax:c1", KEY).equals(pdf));
});

test("tampered ciphertext, tag or IV is rejected", () => {
  const s = sealBuffer(Buffer.from("secret value"), "", KEY);
  const flip = (b64: string) => {
    const b = Buffer.from(b64, "base64");
    b[0] ^= 1;
    return b.toString("base64");
  };
  assert.throws(() => openBuffer({ ...s, ct: flip(s.ct) }, "", KEY), DecryptError);
  assert.throws(() => openBuffer({ ...s, tag: flip(s.tag) }, "", KEY), DecryptError);
  assert.throws(() => openBuffer({ ...s, iv: flip(s.iv) }, "", KEY), DecryptError);
  assert.throws(() => openBuffer({ ...s, v: 2 }, "", KEY), DecryptError);
  assert.throws(() => openFile(Buffer.from("not json"), "", KEY), DecryptError);
});

test("wrong key is rejected", () => {
  const s = sealJson({ x: 1 }, "", KEY);
  assert.throws(() => openJson(s, "", OTHER), DecryptError);
});

test("context is bound: a value moved to another creator won't open", () => {
  const s = sealJson({ x: 1 }, "bank:c1", KEY);
  assert.throws(() => openJson(s, "bank:c2", KEY), DecryptError);
  assert.throws(() => openJson(s, "", KEY), DecryptError);
});

test("fails closed without a valid key", () => {
  const saved = process.env[KEY_ENV];
  const origError = console.error;
  console.error = () => {};
  try {
    delete process.env[KEY_ENV];
    assert.equal(encryptionConfigured(), false);
    assert.throws(() => sealJson({ x: 1 }), PaymentsDisabledError);
    process.env[KEY_ENV] = Buffer.alloc(16).toString("base64");
    assert.equal(encryptionConfigured(), false);
    assert.throws(() => sealJson({ x: 1 }), /switched on/);
    process.env[KEY_ENV] = KEY.toString("base64");
    assert.equal(encryptionConfigured(), true);
    assert.deepEqual(openJson(sealJson({ x: 1 }, "k"), "k"), { x: 1 }, "env key works");
  } finally {
    console.error = origError;
    if (saved === undefined) delete process.env[KEY_ENV];
    else process.env[KEY_ENV] = saved;
  }
});

test("parseKey accepts only 32-byte base64", () => {
  assert.ok(parseKey(KEY.toString("base64")));
  assert.ok(parseKey(` ${KEY.toString("base64")}\n`));
  assert.equal(parseKey(""), null);
  assert.equal(parseKey("not base64 !!"), null);
  assert.equal(parseKey(randomBytes(31).toString("base64")), null);
});
