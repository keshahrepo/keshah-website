// Run: npx tsx --test lib/creators/accept.test.ts
// Google Groups provisioning against a fake fetch (no network) + invite helpers.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROUP_DESCRIPTION,
  GROUP_SETTINGS,
  candidateAddresses,
  checkGoogleConnection,
  groupDisplayName,
  provisionCreatorGroup,
  type GroupsClient,
} from "./google-groups";
import { hashInviteToken, inviteProblem, newInvite, passwordProblem, setPasswordUrl, welcomeEmail } from "./invite";
import { hashPassword, verifyPassword } from "../password";

type Call = { method: string; url: string; body?: unknown };

/** Fake Google: `groups` maps email -> {name, description} for existing groups; `users` are taken addresses. */
function fakeClient(opts: { groups?: Record<string, { name: string; description: string }>; users?: string[]; settings404?: number; existingMembers?: string[] } = {}) {
  const groups = { ...(opts.groups ?? {}) };
  const users = new Set(opts.users ?? []);
  const members = new Set(opts.existingMembers ?? []);
  let settings404 = opts.settings404 ?? 0;
  const calls: Call[] = [];
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const client: GroupsClient = {
    adminEmail: "admin@keshah.com",
    fetch: async (url, init = {}) => {
      const method = init.method ?? "GET";
      const body = init.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      const u = new URL(url);
      const path = decodeURIComponent(u.pathname);
      let m: RegExpMatchArray | null;
      if (u.host === "admin.googleapis.com") {
        if ((m = path.match(/^\/admin\/directory\/v1\/groups\/([^/]+)\/members\/([^/]+)$/)) && method === "PATCH") return json(200, {});
        if ((m = path.match(/^\/admin\/directory\/v1\/groups\/([^/]+)\/members$/)) && method === "POST") {
          if (members.has(body.email)) return json(409, { error: { message: "Member already exists." } });
          members.add(body.email);
          return json(200, body);
        }
        if ((m = path.match(/^\/admin\/directory\/v1\/groups\/([^/]+)$/)) && method === "GET") {
          return groups[m[1]] ? json(200, { email: m[1], ...groups[m[1]] }) : json(404, { error: { message: "Resource Not Found: groupKey" } });
        }
        if (path === "/admin/directory/v1/groups" && method === "POST") {
          if (groups[body.email] || users.has(body.email)) return json(409, { error: { message: "Entity already exists." } });
          groups[body.email] = { name: body.name, description: body.description };
          return json(200, body);
        }
      }
      if (u.host === "www.googleapis.com" && (m = path.match(/^\/groups\/v1\/groups\/([^/]+)$/)) && method === "PATCH") {
        if (settings404 > 0) {
          settings404--;
          return json(404, { error: { message: "not yet" } });
        }
        return json(200, body);
      }
      return json(500, { error: { message: `unexpected ${method} ${url}` } });
    },
  };
  return { client, calls, groups, members };
}

test("candidateAddresses: ascii, lowercase, fallbacks", () => {
  assert.deepEqual(candidateAddresses("Isai  Hernández López").slice(0, 3), ["isai@keshah.com", "isai.lopez@keshah.com", "isai.lopez2@keshah.com"]);
  assert.deepEqual(candidateAddresses("Zoë").slice(0, 2), ["zoe@keshah.com", "zoe2@keshah.com"]);
  assert.deepEqual(candidateAddresses("   "), []);
});

test("provision: creates firstname@, applies settings, adds member + owner", async () => {
  const f = fakeClient();
  const r = await provisionCreatorGroup(f.client, { fullName: "Jane Doe", personalEmail: "Jane@Gmail.com" }, { retryDelayMs: 1 });
  assert.equal(r.email, "jane@keshah.com");
  assert.equal(r.created, true);
  assert.deepEqual(f.groups["jane@keshah.com"], { name: groupDisplayName("Jane Doe"), description: GROUP_DESCRIPTION });
  const settings = f.calls.find((c) => c.url.includes("/groups/v1/groups/"));
  assert.deepEqual(settings?.body, GROUP_SETTINGS);
  assert.ok(settings?.url.includes("alt=json"));
  assert.ok(f.members.has("jane@gmail.com"));
  const ownerAdd = f.calls.find((c) => c.method === "POST" && c.url.endsWith("/members") && (c.body as { role: string }).role === "OWNER");
  assert.equal((ownerAdd?.body as { email: string }).email, "admin@keshah.com");
});

test("provision: taken by a user or someone else's group falls back to first.last, then first.last2", async () => {
  const f = fakeClient({ users: ["jane@keshah.com"], groups: { "jane.doe@keshah.com": { name: "Marketing", description: "" } } });
  const r = await provisionCreatorGroup(f.client, { fullName: "Jane Doe", personalEmail: "j@x.com" }, { retryDelayMs: 1 });
  assert.equal(r.email, "jane.doe2@keshah.com");
  assert.deepEqual(r.tried, ["jane@keshah.com", "jane.doe@keshah.com", "jane.doe2@keshah.com"]);
});

test("provision: re-run reuses our own group, tolerates existing members, retries settings 404", async () => {
  const f = fakeClient({
    groups: { "jane@keshah.com": { name: groupDisplayName("Jane Doe"), description: GROUP_DESCRIPTION } },
    existingMembers: ["j@x.com", "admin@keshah.com"],
    settings404: 2,
  });
  const r = await provisionCreatorGroup(f.client, { fullName: "Jane Doe", personalEmail: "j@x.com" }, { retryDelayMs: 1 });
  assert.equal(r.email, "jane@keshah.com");
  assert.equal(r.created, false);
  assert.equal(f.calls.filter((c) => c.method === "POST" && c.url.endsWith("/v1/groups")).length, 0);
  assert.ok(f.calls.some((c) => c.method === "PATCH" && c.url.includes("/members/admin%40keshah.com")), "admin promoted to OWNER");
});

test("provision: override address that's taken is an error (no fallback)", async () => {
  const f = fakeClient({ users: ["jd@keshah.com"] });
  await assert.rejects(
    provisionCreatorGroup(f.client, { fullName: "Jane Doe", personalEmail: "j@x.com", override: "jd@keshah.com" }, { retryDelayMs: 1 }),
    /already taken/,
  );
  await assert.rejects(provisionCreatorGroup(f.client, { fullName: "Jane Doe", personalEmail: "j@x.com", override: "jd@gmail.com" }), /valid @keshah\.com/);
});

test("checkGoogleConnection: env + key errors never echo the key", async () => {
  const saved = { k: process.env.GOOGLE_GROUPS_SA_KEY, a: process.env.GOOGLE_ADMIN_EMAIL };
  try {
    delete process.env.GOOGLE_GROUPS_SA_KEY;
    delete process.env.GOOGLE_ADMIN_EMAIL;
    let r = await checkGoogleConnection();
    assert.equal(r.stage, "env");
    process.env.GOOGLE_GROUPS_SA_KEY = "{not json SECRET123";
    process.env.GOOGLE_ADMIN_EMAIL = "boss@keshah.com";
    r = await checkGoogleConnection();
    assert.equal(r.stage, "key");
    assert.match(r.message, /not valid JSON/);
    assert.ok(!r.message.includes("SECRET123"));
    process.env.GOOGLE_GROUPS_SA_KEY = JSON.stringify({ client_email: "sa@p.iam.gserviceaccount.com", private_key: "nope" });
    r = await checkGoogleConnection();
    assert.equal(r.stage, "key");
    assert.match(r.message, /PEM/);
  } finally {
    if (saved.k === undefined) delete process.env.GOOGLE_GROUPS_SA_KEY;
    else process.env.GOOGLE_GROUPS_SA_KEY = saved.k;
    if (saved.a === undefined) delete process.env.GOOGLE_ADMIN_EMAIL;
    else process.env.GOOGLE_ADMIN_EMAIL = saved.a;
  }
});

test("invite tokens: hash-only, expiry, single use", () => {
  const now = new Date("2026-10-06T12:00:00Z");
  const { token, invite } = newInvite(now);
  assert.equal(invite.token_hash, hashInviteToken(token));
  assert.ok(!JSON.stringify(invite).includes(token));
  assert.equal(Buffer.from(token, "base64url").length, 32);
  assert.equal(inviteProblem(invite, now), null);
  assert.match(inviteProblem(invite, new Date("2026-10-13T12:00:01Z"))!, /expired/);
  assert.match(inviteProblem({ ...invite, used_at: now.toISOString() }, now)!, /already used/);
  assert.match(inviteProblem(null, now)!, /isn't valid/);
  assert.equal(passwordProblem("1234567"), "Use at least 8 characters.");
  assert.equal(passwordProblem("12345678"), null);
  assert.equal(setPasswordUrl("https://www.keshah.com/", "abc"), "https://www.keshah.com/creator/set-password?token=abc");
});

test("password set the same way login verifies it", () => {
  const { hash, salt } = hashPassword("correct horse");
  assert.ok(verifyPassword("correct horse", hash, salt));
  assert.ok(!verifyPassword("wrong", hash, salt));
});

test("welcome email: no em dashes, has link and next steps", () => {
  const m = welcomeEmail({ firstName: "Jen", link: "https://x/creator/set-password?token=t", keshahEmail: "jen@keshah.com", contractReady: false });
  for (const s of [m.subject, m.text, m.html]) assert.ok(!s.includes("—"), "no em dash");
  assert.equal(m.subject, "Your offer from KESHAH");
  assert.ok(m.text.includes("https://x/creator/set-password?token=t"));
  assert.ok(m.text.includes("jen@keshah.com"));
  assert.ok(m.text.includes("It'll be the first step in the app shortly"));
  assert.ok(m.text.includes("Next steps"));
});

test("welcome email sends people to the app when CREATOR_APP_URL is set", () => {
  const prev = process.env.CREATOR_APP_URL;
  process.env.CREATOR_APP_URL = "https://testflight.apple.com/join/abc";
  try {
    const m = welcomeEmail({ firstName: "Jen", link: "https://x/l", contractReady: true });
    assert.ok(m.text.includes("https://testflight.apple.com/join/abc"));
    assert.ok(m.text.includes("Download KESHAH Creators"));
    assert.ok(m.text.includes("first step in the app"));
  } finally {
    if (prev === undefined) delete process.env.CREATOR_APP_URL;
    else process.env.CREATOR_APP_URL = prev;
  }
});

test("welcome email for an existing creator is a portal intro, not an offer", () => {
  const m = welcomeEmail({ firstName: "Isai", link: "https://x/l", contractReady: false, existing: true });
  assert.equal(m.subject, "Your KESHAH creator portal");
  assert.ok(!m.text.includes("Congratulations"));
  assert.ok(m.text.includes("https://x/l"));
  for (const s of [m.subject, m.text]) assert.ok(!s.includes("—"), "no em dash");
});
