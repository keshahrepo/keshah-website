// Run: npx tsx --test lib/creators/account-passwords.test.ts
// Generated TikTok / Instagram passwords: format, wordlist, idempotency,
// founder reveal + save logging, and that no route answers without auth.
// Nothing here touches Firestore.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GENERATED_PASSWORD_RE,
  PASSWORD_MAX,
  creatorAccountPasswords,
  ensureAccountPassword,
  founderPasswordProblem,
  generateAccountPassword,
  revealAccountPassword,
  setAccountPassword,
  type AccountPasswordRecord,
  type AccountPasswordStore,
  type SocialPlatform,
} from "./account-passwords";
import { PASSWORD_WORDS } from "./password-words";
import { CreatorDataError } from "./db";
import { KEY_ENV } from "./secure";
import type { AdminActor } from "./payments";

const KEY = randomBytes(32);
const ACTOR: AdminActor = { who: "app: founder@keshah.com", ip: "1.2.3.4", user_agent: "test" };

function memoryStore(creators = ["C1", "C2"]) {
  const docs = new Map<string, AccountPasswordRecord>();
  const logs: { id: string; action: string; who: string; extra: Record<string, unknown> }[] = [];
  let failLog = false;
  const k = (id: string, p: SocialPlatform) => `${id}/${p}`;
  const store: AccountPasswordStore = {
    async get(id, p) {
      return docs.get(k(id, p)) ?? null;
    },
    async createIfMissing(id, p, rec) {
      const have = docs.get(k(id, p));
      if (have) return have;
      docs.set(k(id, p), rec);
      return rec;
    },
    async put(id, p, rec) {
      docs.set(k(id, p), rec);
    },
    async creatorExists(id) {
      return creators.includes(id);
    },
    async log(id, action, actor, extra = {}) {
      if (failLog) throw new Error("log write failed");
      logs.push({ id, action, who: actor.who, extra });
    },
  };
  return { store, docs, logs, failLogs: () => (failLog = true) };
}

// ---------------------------------------------------------------- generation

test("generated passwords: Word-word-word-NN, 8 to 20 chars, letters + digits + symbol", () => {
  for (let n = 0; n < 2000; n++) {
    const pw = generateAccountPassword();
    assert.match(pw, GENERATED_PASSWORD_RE);
    assert.ok(pw.length >= 8 && pw.length <= PASSWORD_MAX, `length ${pw.length}`);
    assert.match(pw, /[A-Z]/);
    assert.match(pw, /[a-z]/);
    assert.match(pw, /[0-9]/);
    assert.match(pw, /[^A-Za-z0-9]/);
  }
});

test("generation uses every word position and both digit ends of the range", () => {
  const max = generateAccountPassword((min, maxEx) => maxEx - 1);
  const min = generateAccountPassword((lo) => lo);
  assert.match(max, /-99$/);
  assert.match(min, /-10$/);
  const words = PASSWORD_WORDS;
  assert.equal(min.split("-")[1], words[0]);
  assert.equal(max.split("-")[1], words[words.length - 1]);
});

test("wordlist: 1,000+ unique lowercase words of 3 to 5 letters, none on the blocklist", () => {
  assert.ok(PASSWORD_WORDS.length >= 1000, `${PASSWORD_WORDS.length} words`);
  assert.equal(new Set(PASSWORD_WORDS).size, PASSWORD_WORDS.length);
  for (const w of PASSWORD_WORDS) assert.match(w, /^[a-z]{3,5}$/, w);
  const blocked = ["kill", "dead", "die", "gun", "drug", "sex", "hate", "fat", "ugly", "dumb", "slave", "nazi", "bomb", "race", "black", "white", "pig", "cow"];
  for (const b of blocked) assert.ok(!PASSWORD_WORDS.includes(b), b);
});

test("founder passwords: 6 to 128 characters, no edge spaces or line breaks", () => {
  assert.equal(founderPasswordProblem("Maple-river-cloud-42"), null);
  assert.equal(founderPasswordProblem("abc123"), null);
  assert.ok(founderPasswordProblem(""));
  assert.ok(founderPasswordProblem(undefined));
  assert.ok(founderPasswordProblem(12345678));
  assert.ok(founderPasswordProblem("abc12"));
  assert.ok(founderPasswordProblem(" abc12345"));
  assert.ok(founderPasswordProblem("abc\n12345"));
  assert.ok(founderPasswordProblem("a".repeat(129)));
});

// ---------------------------------------------------------------- storage

test("lazy + idempotent: same password every time, sealed at rest, separate per platform and creator", async () => {
  const { store, docs } = memoryStore();
  const a = await creatorAccountPasswords(store, "C1", { key: KEY });
  const b = await creatorAccountPasswords(store, "C1", { key: KEY });
  assert.deepEqual(a, b);
  assert.match(a.tiktok, GENERATED_PASSWORD_RE);
  assert.match(a.instagram, GENERATED_PASSWORD_RE);
  assert.notEqual(a.tiktok, a.instagram);
  const other = await creatorAccountPasswords(store, "C2", { key: KEY });
  assert.notEqual(other.tiktok, a.tiktok);

  const rec = docs.get("C1/tiktok")!;
  assert.equal(rec.platform, "tiktok");
  assert.equal(rec.set_by, "generated");
  assert.ok(rec.created_at && rec.updated_at);
  assert.ok(!JSON.stringify([...docs.values()]).includes(a.tiktok));
  assert.ok(!JSON.stringify([...docs.values()]).includes(a.instagram));
});

test("two first opens at once both get the one that was saved", async () => {
  const { store } = memoryStore();
  const [x, y] = await Promise.all([ensureAccountPassword(store, "C1", "tiktok", { key: KEY }), ensureAccountPassword(store, "C1", "tiktok", { key: KEY })]);
  assert.equal(x, y);
});

test("a sealed password moved to another creator or platform won't open", async () => {
  const { store, docs } = memoryStore();
  await creatorAccountPasswords(store, "C1", { key: KEY });
  docs.set("C2/tiktok", docs.get("C1/tiktok")!);
  docs.set("C1/instagram", docs.get("C1/tiktok")!);
  await assert.rejects(revealAccountPassword(store, "C2", "tiktok", ACTOR, { key: KEY }), (e: unknown) => e instanceof CreatorDataError && e.status === 500);
  await assert.rejects(ensureAccountPassword(store, "C1", "instagram", { key: KEY }), CreatorDataError);
});

test("no CREATOR_DATA_KEY: friendly 503, nothing generated", async () => {
  const prev = process.env[KEY_ENV];
  delete process.env[KEY_ENV];
  try {
    const { store, docs } = memoryStore();
    await assert.rejects(creatorAccountPasswords(store, "C1"), (e: unknown) => e instanceof CreatorDataError && e.status === 503);
    assert.equal(docs.size, 0);
  } finally {
    if (prev !== undefined) process.env[KEY_ENV] = prev;
  }
});

// ---------------------------------------------------------------- founder

test("reveal: logged first (no value in the log); a failed log reveals nothing", async () => {
  const { store, logs, failLogs } = memoryStore();
  const mine = await creatorAccountPasswords(store, "C1", { key: KEY });
  assert.equal(logs.length, 0); // the creator's own reads aren't founder reveals
  assert.equal(await revealAccountPassword(store, "C1", "instagram", ACTOR, { key: KEY }), mine.instagram);
  assert.deepEqual(logs, [{ id: "C1", action: "reveal_instagram_password", who: ACTOR.who, extra: { platform: "instagram" } }]);
  assert.ok(!JSON.stringify(logs).includes(mine.instagram));
  failLogs();
  await assert.rejects(revealAccountPassword(store, "C1", "tiktok", ACTOR, { key: KEY }), /log write failed/);
});

test("reveal before the creator opened the step: 404, and 404 for an unknown creator", async () => {
  const { store, logs } = memoryStore();
  await assert.rejects(revealAccountPassword(store, "C1", "tiktok", ACTOR, { key: KEY }), (e: unknown) => e instanceof CreatorDataError && e.status === 404);
  await assert.rejects(revealAccountPassword(store, "NOPE", "tiktok", ACTOR, { key: KEY }), /Creator not found/);
  assert.equal(logs.length, 0);
});

test("founder save: validated, logged without the value, then it's what the creator sees", async () => {
  const { store, docs, logs } = memoryStore();
  const before = await creatorAccountPasswords(store, "C1", { key: KEY });
  const created = docs.get("C1/tiktok")!.created_at;
  await assert.rejects(setAccountPassword(store, "C1", "tiktok", "short", ACTOR, { key: KEY }), (e: unknown) => e instanceof CreatorDataError && e.status === 400);
  await assert.rejects(setAccountPassword(store, "NOPE", "tiktok", "Brand-new-pass-77", ACTOR, { key: KEY }), /Creator not found/);
  const res = await setAccountPassword(store, "C1", "tiktok", "Brand-new-pass-77", ACTOR, { key: KEY, now: () => new Date("2026-11-01T00:00:00Z") });
  assert.deepEqual(res, { platform: "tiktok", set_by: "founder", updated_at: "2026-11-01T00:00:00.000Z" });
  const rec = docs.get("C1/tiktok")!;
  assert.equal(rec.set_by, "founder");
  assert.equal(rec.updated_by, ACTOR.who);
  assert.equal(rec.created_at, created);
  assert.ok(!JSON.stringify(rec).includes("Brand-new-pass-77"));
  assert.deepEqual(logs.map((l) => l.action), ["set_tiktok_password"]);
  assert.ok(!JSON.stringify(logs).includes("Brand-new-pass-77"));
  const after = await creatorAccountPasswords(store, "C1", { key: KEY });
  assert.equal(after.tiktok, "Brand-new-pass-77");
  assert.equal(after.instagram, before.instagram);
});

// ---------------------------------------------------------------- routes refuse without auth

test("routes: no credentials, or the wrong role, never reach the passwords", async () => {
  const { createToken, COOKIE_NAME } = await import("../auth");
  const creatorRoute = await import("../../app/api/creator/account-passwords/route");
  const statusRoute = await import("../../app/api/admin/creators/[id]/account-passwords/route");
  const pwRoute = await import("../../app/api/admin/creators/[id]/account-passwords/[platform]/route");
  const base = "http://localhost";
  const creatorCookie = { cookie: `${COOKIE_NAME}=${await createToken({ role: "creator", userId: "C1", name: "x" })}` };
  const adminCookie = { cookie: `${COOKIE_NAME}=${await createToken({ role: "admin", userId: "A1", name: "a" })}` };
  const idCtx = { params: Promise.resolve({ id: "C1" }) };
  const pwCtx = () => ({ params: Promise.resolve({ id: "C1", platform: "tiktok" }) });
  const put = (headers: Record<string, string> = {}) =>
    new NextRequest(`${base}/api/admin/creators/C1/account-passwords/tiktok`, { method: "PUT", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify({ password: "Brand-new-pass-77" }) });
  const denied = async (p: Promise<Response>, status: number[]) => {
    const r = await p;
    assert.ok(r instanceof NextResponse);
    assert.ok(status.includes(r.status), `status ${r.status}`);
    const body = await r.text();
    assert.ok(/"error"/.test(body) && !/"passwords?"/.test(body), body);
  };

  // Creator route: nothing, an admin cookie, a garbage bearer.
  await denied(creatorRoute.GET(new NextRequest(`${base}/api/creator/account-passwords`)), [401]);
  await denied(creatorRoute.GET(new NextRequest(`${base}/api/creator/account-passwords`, { headers: adminCookie })), [403]);
  const prevSecret = process.env.MOBILE_JWT_SECRET;
  process.env.MOBILE_JWT_SECRET = "test-secret-123";
  try {
    await denied(creatorRoute.GET(new NextRequest(`${base}/api/creator/account-passwords`, { headers: { authorization: "Bearer garbage" } })), [401]);
  } finally {
    if (prevSecret === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = prevSecret;
  }

  // Founder routes: nothing, or a creator's own cookie.
  for (const headers of [{}, creatorCookie]) {
    await denied(statusRoute.GET(new NextRequest(`${base}/api/admin/creators/C1/account-passwords`, { headers }), idCtx), [403]);
    await denied(pwRoute.GET(new NextRequest(`${base}/api/admin/creators/C1/account-passwords/tiktok`, { headers }), pwCtx()), [403]);
    await denied(pwRoute.PUT(put(headers), pwCtx()), [403]);
  }
});
