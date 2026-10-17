import { test } from "node:test";
import assert from "node:assert/strict";
import { appVersionFrom, compareVersions, provesRelease } from "./release";

test("compareVersions matches the app: dotted parts, then the build", () => {
  assert.equal(compareVersions("1.0.0+18", "1.0.0+19"), -1);
  assert.equal(compareVersions("1.0.0+19", "1.0.0+19"), 0);
  assert.equal(compareVersions("1.0.1+1", "1.0.0+19"), 1);
  assert.equal(compareVersions("1.0.0+5", "1.0.0"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
});

test("appVersionFrom reads X-App-Version and ignores junk", () => {
  assert.equal(appVersionFrom(new Headers({ "X-App-Version": "1.0.0+19" })), "1.0.0+19");
  assert.equal(appVersionFrom(new Headers({ "X-App-Version": "drop table" })), null);
  assert.equal(appVersionFrom(new Headers()), null);
});

test("only a real creator on the pending build or newer proves the release", () => {
  const creator = { sub: "c@x.com", role: "creator" as const, amr: "email_code" as const };
  const base = { pending: "1.0.0+19", version: "1.0.0+19", claims: creator, staff: false };
  assert.equal(provesRelease(base), true);
  assert.equal(provesRelease({ ...base, version: "1.0.0+20" }), true);
  assert.equal(provesRelease({ ...base, version: "1.0.0+18" }), false);
  assert.equal(provesRelease({ ...base, staff: true }), false, "the founder gets internal builds before Apple's review");
  assert.equal(provesRelease({ ...base, claims: { ...creator, amr: "demo" } }), false, "App Review's demo account");
  assert.equal(provesRelease({ ...base, claims: { sub: "a@x.com", role: "applicant" } }), false);
  assert.equal(provesRelease({ ...base, claims: null }), false);
  assert.equal(provesRelease({ ...base, pending: undefined }), false);
});
