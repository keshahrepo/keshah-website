// Run: npx tsx --test lib/creators/mobile.test.ts
// KESHAH Creators app backend: sign-in codes, tokens, role resolution, bearer
// auth on creator routes, applicant status, check-in window, push tokens, nudge.
// Nothing here touches Firestore, email or FCM.
import { test } from "node:test";
import assert from "node:assert/strict";
import { NextRequest, NextResponse } from "next/server";
import {
  CODE_TTL_MS,
  EMAIL_MIN_GAP_MS,
  IP_SENDS_PER_HOUR,
  MAX_ATTEMPTS,
  codeEmail,
  issueCode,
  memoryCodeStore,
  verifyCode,
} from "../mobile/codes";
import { signMobileToken, verifyMobileToken, bearerToken, normalizeEmail } from "../mobile/token";
import { claimsFor, creatorIdForClaims, pickRole, type IdentityLookup } from "../mobile/identity";
import { applicantStatus, checkInWindow, interviewCard, videoDeadlineMs, videoProblem } from "../mobile/applicant";
import { dailyNudge, registerPushToken, sendPush, validPushToken, type PushMessenger, type PushStore, type PushTokenRecord } from "../push";
import { nudgeDateDue, nudgeNeeded } from "../mobile/nudge";
import { creatorIdFromRequest } from "../../app/api/creator/_auth";
import { completeLink, firebaseSignIn, type DecodedIdToken, type LinkStore } from "../mobile/firebase-signin";
import { signLinkToken, verifyLinkToken } from "../mobile/token";

const SECRET = "test-secret-123";
const T0 = Date.parse("2026-10-07T16:00:00.000Z");
const MIN = 60 * 1000;

// ---------------------------------------------------------------- codes

test("code: issue then verify once; a used code can't be reused", async () => {
  const store = memoryCodeStore();
  const r = await issueCode(store, { email: "a@x.com", ip: "1.1.1.1", secret: SECRET, nowMs: T0, code: "123456" });
  assert.deepEqual(r, { ok: true, code: "123456" });
  // Only the hash is stored.
  assert.ok(![...store.codes.values()].some((s) => JSON.stringify(s).includes("123456")));
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "123456", secret: SECRET, nowMs: T0 + MIN })).result, "ok");
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "123456", secret: SECRET, nowMs: T0 + MIN })).result, "none");
});

test("code: expires after 10 minutes", async () => {
  const store = memoryCodeStore();
  await issueCode(store, { email: "a@x.com", ip: "ip", secret: SECRET, nowMs: T0, code: "111111" });
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "111111", secret: SECRET, nowMs: T0 + CODE_TTL_MS })).result, "expired");
});

test("code: 5 wrong tries kill it, even the right code after that", async () => {
  const store = memoryCodeStore();
  await issueCode(store, { email: "a@x.com", ip: "ip", secret: SECRET, nowMs: T0, code: "222222" });
  const left: number[] = [];
  for (let i = 0; i < MAX_ATTEMPTS - 1; i++) {
    const r = await verifyCode(store, { email: "a@x.com", code: "000000", secret: SECRET, nowMs: T0 });
    assert.equal(r.result, "wrong");
    left.push(r.attemptsLeft);
  }
  assert.deepEqual(left, [4, 3, 2, 1]);
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "abc", secret: SECRET, nowMs: T0 })).result, "too_many");
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "222222", secret: SECRET, nowMs: T0 })).result, "too_many");
});

test("code: a code for one email doesn't work for another; no code issued = none", async () => {
  const store = memoryCodeStore();
  await issueCode(store, { email: "a@x.com", ip: "ip", secret: SECRET, nowMs: T0, code: "333333" });
  assert.equal((await verifyCode(store, { email: "b@x.com", code: "333333", secret: SECRET, nowMs: T0 })).result, "none");
});

test("code: rate limits per email (30s gap, 5 an hour) and per IP", async () => {
  const store = memoryCodeStore();
  const issue = (email: string, ip: string, at: number) => issueCode(store, { email, ip, secret: SECRET, nowMs: at });
  assert.ok((await issue("a@x.com", "ip1", T0)).ok);
  assert.deepEqual(await issue("a@x.com", "ip1", T0 + EMAIL_MIN_GAP_MS - 1), { ok: false, reason: "too_soon" });
  for (let i = 1; i < 5; i++) assert.ok((await issue("a@x.com", "ip1", T0 + i * MIN)).ok);
  assert.deepEqual(await issue("a@x.com", "ip1", T0 + 10 * MIN), { ok: false, reason: "email_limit" });
  assert.ok((await issue("a@x.com", "ip1", T0 + 61 * MIN)).ok, "an hour later it's fine again");
  // IP: 20 different emails, then blocked.
  const s2 = memoryCodeStore();
  for (let i = 0; i < IP_SENDS_PER_HOUR; i++) assert.ok((await issueCode(s2, { email: `u${i}@x.com`, ip: "9.9.9.9", secret: SECRET, nowMs: T0 })).ok);
  assert.deepEqual(await issueCode(s2, { email: "new@x.com", ip: "9.9.9.9", secret: SECRET, nowMs: T0 }), { ok: false, reason: "ip_limit" });
});

test("code: a new code replaces the old one and resets tries", async () => {
  const store = memoryCodeStore();
  await issueCode(store, { email: "a@x.com", ip: "ip", secret: SECRET, nowMs: T0, code: "444444" });
  await verifyCode(store, { email: "a@x.com", code: "000000", secret: SECRET, nowMs: T0 });
  await issueCode(store, { email: "a@x.com", ip: "ip", secret: SECRET, nowMs: T0 + MIN, code: "555555" });
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "444444", secret: SECRET, nowMs: T0 + MIN })).attemptsLeft, 4);
  assert.equal((await verifyCode(store, { email: "a@x.com", code: "555555", secret: SECRET, nowMs: T0 + MIN })).result, "ok");
});

test("code email: plain, has the code, no em dashes", () => {
  const m = codeEmail("098765");
  assert.equal(m.subject, "Your KESHAH Creators code");
  assert.match(m.text, /098765/);
  assert.match(m.text, /10 minutes/);
  assert.ok(!m.text.includes("—"));
});

// ---------------------------------------------------------------- tokens

test("token: round trip, wrong secret, expiry after 180 days, no secret", async () => {
  const now = new Date(T0);
  const t = await signMobileToken({ sub: "a@x.com", role: "creator", cid: "c1" }, { secret: SECRET, now });
  assert.deepEqual(await verifyMobileToken(t, { secret: SECRET, now }), { sub: "a@x.com", role: "creator", cid: "c1" });
  assert.equal(await verifyMobileToken(t, { secret: "other", now }), null);
  assert.ok(await verifyMobileToken(t, { secret: SECRET, now: new Date(T0 + 179 * 86400_000) }));
  assert.equal(await verifyMobileToken(t, { secret: SECRET, now: new Date(T0 + 181 * 86400_000) }), null);
  assert.equal(await verifyMobileToken(t, { secret: "" }), null);
  await assert.rejects(() => signMobileToken({ sub: "a@x.com", role: "none" }, { secret: "" }));
});

test("bearer header parsing and email normalising", () => {
  assert.equal(bearerToken(new Headers({ authorization: "Bearer abc.def" })), "abc.def");
  assert.equal(bearerToken(new Headers({ authorization: "Basic x" })), null);
  assert.equal(bearerToken(new Headers()), null);
  assert.equal(normalizeEmail("  Sam@Gmail.COM "), "sam@gmail.com");
  assert.equal(normalizeEmail("nope"), null);
});

// ---------------------------------------------------------------- roles

function lookup(creators: Record<string, string>, apps: Record<string, string>): IdentityLookup {
  return {
    creator: async (e) => (creators[e] ? { id: creators[e], name: "Cre Ator" } : null),
    application: async (e) => (apps[e] ? { id: apps[e], name: "App Licant" } : null),
  };
}

test("role: creator beats applicant, applicant beats none", async () => {
  const l = lookup({ "c@x.com": "C1" }, { "c@x.com": "A0", "a@x.com": "A1" });
  assert.deepEqual(await pickRole(l, "c@x.com"), { role: "creator", name: "Cre Ator", email: "c@x.com", creator_id: "C1", application_id: "A0" });
  assert.deepEqual(await pickRole(l, "a@x.com"), { role: "applicant", name: "App Licant", email: "a@x.com", application_id: "A1" });
  assert.deepEqual(await pickRole(l, "z@x.com"), { role: "none", name: "", email: "z@x.com" });
  assert.deepEqual(claimsFor(await pickRole(l, "a@x.com")), { sub: "a@x.com", role: "applicant", aid: "A1" });
});

test("role: an applicant token finds the creator once they're accepted", async () => {
  const find = async (e: string) => (e === "a@x.com" ? { id: "C9", name: "" } : null);
  assert.equal(await creatorIdForClaims({ sub: "a@x.com", role: "applicant", aid: "A1" }, find), "C9");
  assert.equal(await creatorIdForClaims({ sub: "b@x.com", role: "creator", cid: "C2" }, find), "C2");
  assert.equal(await creatorIdForClaims({ sub: "n@x.com", role: "none" }, find), null);
});

// ---------------------------------------------------------------- bearer on creator routes

test("creator routes accept a mobile Bearer token and resolve the same creator id", async () => {
  const prev = process.env.MOBILE_JWT_SECRET;
  process.env.MOBILE_JWT_SECRET = SECRET;
  try {
    const deps = { findCreatorByEmail: async (e: string) => (e === "a@x.com" ? { id: "C7", name: "" } : null) };
    const url = "http://localhost/api/creator/portal";
    const tok = await signMobileToken({ sub: "x@x.com", role: "creator", cid: "C1" });
    const ok = await creatorIdFromRequest(new NextRequest(url, { headers: { authorization: `Bearer ${tok}` } }), deps);
    assert.deepEqual(ok, { id: "C1" });
    const applicantTok = await signMobileToken({ sub: "a@x.com", role: "applicant", aid: "A1" });
    assert.deepEqual(await creatorIdFromRequest(new NextRequest(url, { headers: { authorization: `Bearer ${applicantTok}` } }), deps), { id: "C7" });
    const noneTok = await signMobileToken({ sub: "n@x.com", role: "none" });
    const denied = await creatorIdFromRequest(new NextRequest(url, { headers: { authorization: `Bearer ${noneTok}` } }), deps);
    assert.ok(denied instanceof NextResponse && denied.status === 403);
    const bad = await creatorIdFromRequest(new NextRequest(url, { headers: { authorization: "Bearer garbage" } }), deps);
    assert.ok(bad instanceof NextResponse && bad.status === 401);
    const nothing = await creatorIdFromRequest(new NextRequest(url), deps);
    assert.ok(nothing instanceof NextResponse && nothing.status === 401);
  } finally {
    if (prev === undefined) delete process.env.MOBILE_JWT_SECRET;
    else process.env.MOBILE_JWT_SECRET = prev;
  }
});

test("creator routes still take the portal cookie (dashboard JWT)", async () => {
  const { createToken, COOKIE_NAME } = await import("../auth");
  const session = await createToken({ role: "creator", userId: "C3", name: "x" });
  const req = new NextRequest("http://localhost/api/creator/portal", { headers: { cookie: `${COOKIE_NAME}=${session}` } });
  assert.deepEqual(await creatorIdFromRequest(req), { id: "C3" });
  // A dashboard cookie token is not a valid mobile bearer.
  process.env.MOBILE_JWT_SECRET = SECRET;
  try {
    const r = await creatorIdFromRequest(new NextRequest("http://localhost/api/creator/portal", { headers: { authorization: `Bearer ${session}` } }));
    assert.ok(r instanceof NextResponse && r.status === 401);
  } finally {
    delete process.env.MOBILE_JWT_SECRET;
  }
});

// ---------------------------------------------------------------- applicant

const START = "2026-10-08T18:00:00.000000Z";
const startMs = Date.parse(START);
const ctx = (nowMs: number, extra: Partial<{ sessionClosesAtMs: number | null; sessionOpen: boolean | null }> = {}) => ({
  nowMs,
  sessionClosesAtMs: null,
  sessionOpen: null,
  ...extra,
});

test("status mapping", () => {
  assert.equal(applicantStatus({ status: "awaiting_booking" }, ctx(T0)), "applied");
  assert.equal(applicantStatus({ status: "booked", calendly_event_start_time: START }, ctx(startMs - 3600_000)), "interview_booked");
  // After the call, still booked while the video can be sent (11:59 PM ET the day after).
  assert.equal(applicantStatus({ status: "booked", calendly_event_start_time: START }, ctx(startMs + 5 * 3600_000)), "interview_booked");
  assert.equal(applicantStatus({ status: "booked", calendly_event_start_time: START }, ctx(startMs + 3 * 86400_000)), "applied");
  assert.equal(applicantStatus({ status: "booked", calendly_event_start_time: START, interview_video_submitted_at: "x" }, ctx(startMs)), "in_review");
  assert.equal(applicantStatus({ status: "completed", interview_passed_at: "x" }, ctx(T0)), "in_review");
  assert.equal(applicantStatus({ status: "denied", interview_video_submitted_at: "x" }, ctx(T0)), "not_moving_forward");
  assert.equal(applicantStatus({ status: "accepted" }, ctx(T0)), "accepted");
});

test("video deadline: explicit field, then session close, then day after the booking, else none", () => {
  assert.equal(videoDeadlineMs({ interview_video_deadline: "2026-10-09T00:00:00Z", calendly_event_start_time: START }, 5), Date.parse("2026-10-09T00:00:00Z"));
  assert.equal(videoDeadlineMs({ interview_session: "oct-8", calendly_event_start_time: START }, 12345), 12345);
  // Oct 8 2 PM ET -> Oct 9 11:59 PM EDT = Oct 10 03:59 UTC.
  assert.equal(videoDeadlineMs({ interview_session: "video", calendly_event_start_time: START }, 12345), Date.parse("2026-10-10T03:59:00Z"));
  assert.equal(videoDeadlineMs({}, null), null);
});

test("video submit is refused after the deadline or a closed session", () => {
  const app = { status: "booked", calendly_event_start_time: START };
  assert.equal(videoProblem(app, ctx(startMs)), null);
  assert.match(videoProblem(app, ctx(Date.parse("2026-10-10T04:00:00Z")))!, /deadline/);
  assert.match(videoProblem({ ...app, interview_session: "oct-8" }, ctx(startMs, { sessionOpen: false }))!, /deadline/);
  assert.match(videoProblem({ ...app, interview_video_submitted_at: "x" }, ctx(startMs))!, /already/);
  assert.equal(videoProblem({ status: "awaiting_booking" }, ctx(T0)), null, "always-open video link has no deadline");
});

test("check-in window: 70 min before to 30 min after the start", () => {
  const app = { status: "booked", calendly_event_start_time: START };
  assert.equal(checkInWindow(app, startMs - 71 * MIN), "too_early");
  assert.equal(checkInWindow(app, startMs - 70 * MIN), "open");
  assert.equal(checkInWindow(app, startMs), "open");
  assert.equal(checkInWindow(app, startMs + 30 * MIN), "open");
  assert.equal(checkInWindow(app, startMs + 31 * MIN), "too_late");
  assert.equal(checkInWindow({ status: "awaiting_booking" }, startMs), "no_booking");
  assert.equal(checkInWindow({ ...app, status: "denied" }, startMs), "no_booking");
});

test("interview card: links, checked in only for this booking, video opens on the call", () => {
  const app = {
    status: "booked",
    calendly_event_start_time: START,
    calendly_join_url: "https://zoom.us/j/1",
    calendly_reschedule_url: "https://calendly.com/r",
    interview_checked_in_at: "x",
    interview_checked_in_for: START,
  };
  const before = interviewCard(app, ctx(startMs - 60 * MIN))!;
  assert.equal(before.starts_at, "2026-10-08T18:00:00.000Z");
  assert.equal(before.join_url, "https://zoom.us/j/1");
  assert.equal(before.checked_in, true);
  assert.equal(before.video_test_open, false);
  assert.equal(before.video_deadline, "2026-10-10T03:59:00.000Z");
  assert.equal(interviewCard(app, ctx(startMs))!.video_test_open, true);
  assert.equal(interviewCard({ ...app, interview_checked_in_for: "2026-10-01T18:00:00Z" }, ctx(startMs))!.checked_in, false);
  assert.equal(interviewCard({ status: "awaiting_booking" }, ctx(T0)), null);
});

// ---------------------------------------------------------------- push

function memPush() {
  const docs = new Map<string, PushTokenRecord>();
  const store: PushStore = {
    async upsert(t, rec) {
      docs.set(t, rec);
    },
    async tokensFor(target) {
      return [...docs.entries()]
        .filter(([, r]) =>
          (target.email && r.email === target.email.toLowerCase()) ||
          (target.creatorId && r.creator_id === target.creatorId) ||
          (target.applicationId && r.application_id === target.applicationId),
        )
        .map(([t]) => t);
    },
    async remove(tokens) {
      for (const t of tokens) docs.delete(t);
    },
  };
  return { docs, store };
}

const TOK_A = "fcm_token_aaaaaaaaaaaaaaaaaaaaa:1";
const TOK_B = "fcm_token_bbbbbbbbbbbbbbbbbbbbb:2";

test("push: register stores the token record; re-register updates it", async () => {
  const { docs, store } = memPush();
  await registerPushToken(TOK_A, { email: "A@X.com", role: "applicant", application_id: "A1", platform: "ios" }, { store, now: new Date(T0) });
  assert.deepEqual(docs.get(TOK_A), {
    email: "a@x.com",
    role: "applicant",
    creator_id: null,
    application_id: "A1",
    platform: "ios",
    updated_at: new Date(T0).toISOString(),
  });
  await registerPushToken(TOK_A, { email: "a@x.com", role: "creator", creator_id: "C1", application_id: "A1", platform: "ios" }, { store });
  assert.equal(docs.get(TOK_A)!.creator_id, "C1");
  assert.equal(docs.size, 1);
  assert.ok(validPushToken(TOK_A));
  assert.ok(!validPushToken("a/b"));
});

test("push: multicasts to all of a person's devices and deletes unregistered tokens", async () => {
  const { docs, store } = memPush();
  await registerPushToken(TOK_A, { email: "a@x.com", role: "creator", creator_id: "C1", platform: "ios" }, { store });
  await registerPushToken(TOK_B, { email: "a@x.com", role: "applicant", application_id: "A1", platform: "android" }, { store });
  const calls: { tokens: string[]; body: string }[] = [];
  const messenger: PushMessenger = {
    async sendEachForMulticast(m) {
      calls.push({ tokens: m.tokens, body: m.notification.body });
      return {
        successCount: 1,
        failureCount: 1,
        responses: m.tokens.map((t) =>
          t === TOK_B ? { success: false, error: { code: "messaging/registration-token-not-registered" } } : { success: true },
        ),
      };
    },
  };
  const r = await sendPush({ creatorId: "C1", email: "a@x.com" }, dailyNudge(3), { store, messenger });
  assert.deepEqual(r, { tokens: 2, sent: 1, failed: 1, removed: 1 });
  assert.equal(calls[0].body, "3 of 5 videos so far today. Deadline 11:59 PM.");
  assert.deepEqual([...docs.keys()], [TOK_A]);
});

test("push: no tokens is a no-op (messaging never called)", async () => {
  const { store } = memPush();
  let called = false;
  const messenger: PushMessenger = {
    async sendEachForMulticast() {
      called = true;
      return { successCount: 0, failureCount: 0, responses: [] };
    },
  };
  assert.deepEqual(await sendPush({ applicationId: "nope" }, dailyNudge(0), { store, messenger }), { tokens: 0, sent: 0, failed: 0, removed: 0 });
  assert.deepEqual(await sendPush({}, dailyNudge(0), { store, messenger }), { tokens: 0, sent: 0, failed: 0, removed: 0 });
  assert.equal(called, false);
});

// ---------------------------------------------------------------- nudge

test("nudge: 8 PM local on a weekday, posting creators only, once a day", () => {
  const c = { is_active: true, status: "active", timezone: "America/Chicago", start_date: "2026-09-01" };
  // Wed Oct 7 2026, 8:05 PM CDT = Oct 8 01:05 UTC.
  const at8 = new Date("2026-10-08T01:05:00Z");
  assert.equal(nudgeDateDue(c, at8, null), "2026-10-07");
  assert.equal(nudgeDateDue(c, at8, "2026-10-07"), null);
  assert.equal(nudgeDateDue(c, new Date("2026-10-08T00:55:00Z"), null), null, "7:55 PM");
  assert.equal(nudgeDateDue({ ...c, status: "onboarding" }, at8, null), null);
  assert.equal(nudgeDateDue({ ...c, start_date: "2026-10-08" }, at8, null), null);
  // Sat Oct 10, 8 PM CDT.
  assert.equal(nudgeDateDue(c, new Date("2026-10-11T01:05:00Z"), null), null);
  assert.equal(nudgeNeeded(4, false), true);
  assert.equal(nudgeNeeded(5, false), false);
  assert.equal(nudgeNeeded(0, true), false);
});

// ---------------------------------------------------------------- Google / Apple

function firebaseDeps(tokens: Record<string, DecodedIdToken>) {
  const links = new Map<string, { email: string; linked_at: string }>();
  const store: LinkStore = {
    async get(uid) {
      return links.get(uid) ?? null;
    },
    async set(uid, rec) {
      links.set(uid, rec);
    },
  };
  return {
    links,
    deps: {
      verifyIdToken: async (t: string) => {
        if (!tokens[t]) throw new Error("auth/argument-error");
        return tokens[t];
      },
      links: store,
      identity: lookup({ "c@x.com": "C1" }, { "a@x.com": "A1" }),
      secret: SECRET,
    },
  };
}

test("firebase: a verified Google email resolves the role and gets a session", async () => {
  const { deps } = firebaseDeps({ g: { uid: "u1", email: "A@X.com", email_verified: true } });
  const r = await firebaseSignIn(deps, "g");
  assert.ok(r.ok && "token" in r.body);
  if (r.ok && "token" in r.body) {
    assert.equal(r.body.role, "applicant");
    assert.equal(r.body.email, "a@x.com");
    assert.equal(r.body.application_id, "A1");
    assert.deepEqual(await verifyMobileToken(r.body.token, { secret: SECRET }), { sub: "a@x.com", role: "applicant", aid: "A1" });
  }
});

test("firebase: Apple private relay, unknown or unverified email -> needs_link with a uid link token", async () => {
  const { deps } = firebaseDeps({
    apple: { uid: "u2", email: "abc123@privaterelay.appleid.com", email_verified: true },
    stranger: { uid: "u3", email: "z@x.com", email_verified: true },
    unverified: { uid: "u4", email: "c@x.com", email_verified: false },
  });
  for (const [t, uid] of [["apple", "u2"], ["stranger", "u3"], ["unverified", "u4"]] as const) {
    const r = await firebaseSignIn(deps, t);
    assert.ok(r.ok && "needs_link" in r.body, t);
    if (r.ok && "needs_link" in r.body) {
      assert.equal(await verifyLinkToken(r.body.link_token, { secret: SECRET }), uid);
      // A link token is never a session.
      assert.equal(await verifyMobileToken(r.body.link_token, { secret: SECRET }), null);
    }
  }
});

test("firebase: link flow completes, and the next Apple sign-in uses the link", async () => {
  const { deps, links } = firebaseDeps({ apple: { uid: "u2", email: "abc123@privaterelay.appleid.com", email_verified: true } });
  const first = await firebaseSignIn(deps, "apple");
  assert.ok(first.ok && "needs_link" in first.body);
  const linkToken = first.ok && "needs_link" in first.body ? first.body.link_token : "";
  // link/start + link/verify: code to the application email, then link.
  const store = memoryCodeStore();
  await issueCode(store, { email: "c@x.com", ip: "ip", secret: SECRET, nowMs: T0, code: "654321" });
  assert.equal((await verifyCode(store, { email: "c@x.com", code: "654321", secret: SECRET, nowMs: T0 })).result, "ok");
  const uid = await verifyLinkToken(linkToken, { secret: SECRET });
  assert.equal(uid, "u2");
  const session = await completeLink(deps, uid!, "c@x.com");
  assert.equal(session.role, "creator");
  assert.equal(session.creator_id, "C1");
  assert.equal(links.get("u2")!.email, "c@x.com");
  const again = await firebaseSignIn(deps, "apple");
  assert.ok(again.ok && "token" in again.body && again.body.role === "creator" && again.body.email === "c@x.com");
});

test("firebase: invalid id_token -> 401; expired link token is refused", async () => {
  const { deps } = firebaseDeps({});
  const r = await firebaseSignIn(deps, "forged");
  assert.ok(!r.ok && r.status === 401);
  const missing = await firebaseSignIn(deps, "");
  assert.ok(!missing.ok && missing.status === 400);
  const lt = await signLinkToken("u9", { secret: SECRET, now: new Date(T0) });
  assert.equal(await verifyLinkToken(lt, { secret: SECRET, now: new Date(T0 + 29 * MIN) }), "u9");
  assert.equal(await verifyLinkToken(lt, { secret: SECRET, now: new Date(T0 + 31 * MIN) }), null);
});
