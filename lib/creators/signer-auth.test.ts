import { test } from "node:test";
import assert from "node:assert/strict";
import { signerAuthFromClaims, signerAuthText } from "./signer-auth";
import { signMobileToken, verifyMobileToken } from "../mobile/token";

const SECRET = "test-secret-for-signer-auth";

test("signer auth: the sign-in method rides on the mobile token and is printed truthfully", async () => {
  const tok = await signMobileToken({ sub: "a@x.com", role: "creator", cid: "C1", amr: "email_code" }, { secret: SECRET });
  const claims = await verifyMobileToken(tok, { secret: SECRET });
  assert.equal(claims?.amr, "email_code");
  assert.equal(signerAuthFromClaims(claims), "app_email_code");
  assert.match(signerAuthText("app_email_code"), /6-digit code emailed/);
  // Old tokens (no amr) are still the app, method unknown; no bearer = the web portal's password session.
  const old = await verifyMobileToken(await signMobileToken({ sub: "a@x.com", role: "creator" }, { secret: SECRET }), { secret: SECRET });
  assert.equal(old?.amr, undefined);
  assert.equal(signerAuthFromClaims(old), "app");
  assert.equal(signerAuthFromClaims(null), "web_password");
  assert.match(signerAuthText("web_password"), /password/);
  for (const a of ["app_email_code", "app_google", "app_apple", "app_social", "app", undefined]) {
    if (a !== "web_password") assert.ok(!/password/.test(signerAuthText(a)), `${a} never claims a password`);
  }
});
