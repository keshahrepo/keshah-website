/**
 * Creator inbox provisioning: a Google Group <name>@keshah.com per creator,
 * via the Admin SDK Directory API + Groups Settings API.
 *
 * Auth: a service account with domain-wide delegation, impersonating a
 * Workspace admin.
 *   GOOGLE_GROUPS_SA_KEY   full JSON key file contents
 *   GOOGLE_ADMIN_EMAIL     admin user to impersonate (also made group OWNER)
 * The service account's client id must be allowed these scopes in the
 * Workspace admin console (Security > API controls > Domain-wide delegation):
 *   https://www.googleapis.com/auth/admin.directory.group
 *   https://www.googleapis.com/auth/apps.groups.settings
 *
 * No Firestore access in this file (kept pure so it can be tested with a fake
 * fetch). Uses google-auth-library's JWT only for the access token and plain
 * fetch for the REST calls (no `googleapis` package).
 */
import { JWT } from "google-auth-library";

export const KESHAH_DOMAIN = "keshah.com";
export const GROUP_DESCRIPTION = "Creator accounts inbox";
export const GROUP_SCOPES = [
  "https://www.googleapis.com/auth/admin.directory.group",
  "https://www.googleapis.com/auth/apps.groups.settings",
];
const DIRECTORY = "https://admin.googleapis.com/admin/directory/v1/groups";
const SETTINGS = "https://www.googleapis.com/groups/v1/groups";

/** Settings applied to every creator inbox group. */
export const GROUP_SETTINGS = {
  allowExternalMembers: "true",
  whoCanPostMessage: "ANYONE_CAN_POST",
  whoCanViewGroup: "ALL_MEMBERS_CAN_VIEW",
  whoCanJoin: "INVITED_CAN_JOIN",
  messageModerationLevel: "MODERATE_NONE",
  // So verification-code emails from TikTok / Instagram are never held as spam.
  spamModerationLevel: "ALLOW",
  includeInGlobalAddressList: "false",
} as const;

export function groupsConfigured(): boolean {
  return !!(process.env.GOOGLE_GROUPS_SA_KEY && process.env.GOOGLE_ADMIN_EMAIL);
}

export function groupDisplayName(fullName: string): string {
  return `KESHAH – ${fullName.trim()}`;
}

/** Lowercase ascii letters/digits only ("José" -> "jose", "O'Neil" -> "oneil"). */
export function asciiSlug(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/**
 * Candidate addresses in order: firstname@, firstname.lastname@,
 * firstname.lastname2@ ... firstname.lastname<max>@.
 */
export function candidateAddresses(fullName: string, max = 9): string[] {
  const parts = fullName.trim().split(/\s+/).map(asciiSlug).filter(Boolean);
  if (!parts.length) return [];
  const first = parts[0];
  const last = parts.length > 1 ? parts[parts.length - 1] : "";
  const out = [`${first}@${KESHAH_DOMAIN}`];
  if (last) {
    out.push(`${first}.${last}@${KESHAH_DOMAIN}`);
    for (let n = 2; n <= max; n++) out.push(`${first}.${last}${n}@${KESHAH_DOMAIN}`);
  } else {
    for (let n = 2; n <= max; n++) out.push(`${first}${n}@${KESHAH_DOMAIN}`);
  }
  return out;
}

export function isKeshahAddress(s: string): boolean {
  return new RegExp(`^[a-z0-9][a-z0-9._-]*@${KESHAH_DOMAIN.replace(".", "\\.")}$`).test(s);
}

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export interface GroupsClient {
  fetch: FetchLike;
  adminEmail: string;
}

/** Parse GOOGLE_GROUPS_SA_KEY (raw JSON, or base64 of it). Errors never echo the key. */
function loadServiceAccountKey(): { client_email: string; private_key: string } {
  const raw = (process.env.GOOGLE_GROUPS_SA_KEY ?? "").trim();
  if (!raw) throw new Error("GOOGLE_GROUPS_SA_KEY is not set.");
  let key: { client_email?: unknown; private_key?: unknown; type?: unknown };
  try {
    key = JSON.parse(raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8"));
  } catch {
    throw new Error("GOOGLE_GROUPS_SA_KEY is not valid JSON (paste the whole key file contents).");
  }
  if (!key || typeof key !== "object") throw new Error("GOOGLE_GROUPS_SA_KEY is not a JSON object.");
  if (typeof key.client_email !== "string" || !key.client_email) throw new Error("GOOGLE_GROUPS_SA_KEY has no client_email.");
  if (typeof key.private_key !== "string" || !key.private_key) throw new Error("GOOGLE_GROUPS_SA_KEY has no private_key.");
  // Tolerate keys pasted with literal "\n" sequences instead of newlines.
  const private_key = key.private_key.replace(/\\n/g, "\n");
  if (!private_key.includes("BEGIN PRIVATE KEY")) throw new Error("GOOGLE_GROUPS_SA_KEY private_key doesn't look like a PEM key.");
  return { client_email: key.client_email, private_key };
}

function adminEmailFromEnv(): string {
  const adminEmail = (process.env.GOOGLE_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (!adminEmail) throw new Error("GOOGLE_ADMIN_EMAIL is not set.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) throw new Error("GOOGLE_ADMIN_EMAIL isn't an email address.");
  return adminEmail;
}

/** Turn a google-auth-library token error into "unauthorized_client: ..." without key material. */
function tokenErrorText(e: unknown): string {
  const g = e as { response?: { status?: number; data?: { error?: string; error_description?: string } }; message?: string };
  const data = g.response?.data;
  if (data?.error) return `${data.error}${data.error_description ? `: ${data.error_description}` : ""}`;
  return String(g.message ?? e).slice(0, 300);
}

async function accessToken(key: { client_email: string; private_key: string }, subject: string): Promise<string> {
  const jwt = new JWT({ email: key.client_email, key: key.private_key, scopes: GROUP_SCOPES, subject });
  let token: string | null | undefined;
  try {
    ({ token } = await jwt.getAccessToken());
  } catch (e) {
    throw new Error(`Google token request failed: ${tokenErrorText(e)}`);
  }
  if (!token) throw new Error("Couldn't get a Google access token (check domain-wide delegation scopes).");
  return token;
}

function authedFetch(token: string): FetchLike {
  return (url, init = {}) =>
    fetch(url, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    });
}

/** Real client from env (access token via domain-wide delegation). */
export async function groupsClientFromEnv(): Promise<GroupsClient> {
  const key = loadServiceAccountKey();
  const adminEmail = adminEmailFromEnv();
  return { adminEmail, fetch: authedFetch(await accessToken(key, adminEmail)) };
}

export interface ConnectionCheck {
  ok: boolean;
  /** Which stage failed or passed last: env, key, token, list. */
  stage: "env" | "key" | "token" | "list";
  message: string;
  /** Domain of GOOGLE_ADMIN_EMAIL only (never the full address). */
  admin_domain?: string;
  groups_listed?: number;
  hint?: string;
}

function hintFor(msg: string): string | undefined {
  if (/unauthorized_client/i.test(msg))
    return "Domain-wide delegation isn't set up for this service account's client ID, or the two scopes (admin.directory.group, apps.groups.settings) aren't both authorised.";
  if (/invalid_grant/i.test(msg)) return "GOOGLE_ADMIN_EMAIL isn't a real user in the Workspace, or the key was revoked / the clock is off.";
  if (/\b403\b/.test(msg))
    return "The impersonated user isn't a Workspace admin with Groups rights, or the Admin SDK API isn't enabled on the service account's Google Cloud project.";
  if (/\b401\b/.test(msg)) return "The token was rejected. Check the scopes in domain-wide delegation.";
  return undefined;
}

/**
 * READ-ONLY connection test for the admin settings page: parses the key,
 * gets a delegated token, lists up to 5 groups. Never returns key material
 * or the full admin email.
 */
export async function checkGoogleConnection(): Promise<ConnectionCheck> {
  if (!groupsConfigured()) {
    const missing = ["GOOGLE_GROUPS_SA_KEY", "GOOGLE_ADMIN_EMAIL"].filter((k) => !process.env[k]);
    return { ok: false, stage: "env", message: `Not set on this deployment: ${missing.join(", ")}` };
  }
  let key: { client_email: string; private_key: string };
  let adminEmail: string;
  try {
    key = loadServiceAccountKey();
    adminEmail = adminEmailFromEnv();
  } catch (e) {
    return { ok: false, stage: "key", message: e instanceof Error ? e.message : String(e) };
  }
  const admin_domain = adminEmail.split("@")[1];
  let token: string;
  try {
    token = await accessToken(key, adminEmail);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, stage: "token", message, admin_domain, hint: hintFor(message) };
  }
  const r = await authedFetch(token)(`${DIRECTORY}?customer=my_customer&maxResults=5`);
  if (!r.ok) {
    const message = `Listing groups failed: ${await errText(r)}`;
    return { ok: false, stage: "list", message, admin_domain, hint: hintFor(message) };
  }
  const j = (await r.json().catch(() => ({}))) as { groups?: unknown[] };
  const n = Array.isArray(j.groups) ? j.groups.length : 0;
  return {
    ok: true,
    stage: "list",
    message: `Connected. Token works and the Directory API listed ${n} group${n === 1 ? "" : "s"} (max 5 checked).`,
    admin_domain,
    groups_listed: n,
  };
}

async function errText(r: Response): Promise<string> {
  const body = await r.text().catch(() => "");
  try {
    const j = JSON.parse(body) as { error?: { message?: string } };
    if (j.error?.message) return `${r.status} ${j.error.message}`;
  } catch {
    /* not json */
  }
  return `${r.status} ${body.slice(0, 200)}`;
}

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export interface ProvisionResult {
  email: string;
  /** false when an existing group we made earlier was reused. */
  created: boolean;
  tried: string[];
}

/**
 * Can this existing group be reused for the creator with `personalEmail`?
 * Yes when they're already a member, or when it has no creator member yet
 * (an earlier run made it but stopped before adding them). No when someone
 * else is the member: two creators with the same full name.
 */
async function groupIsFor(client: GroupsClient, groupEmail: string, personalEmail: string): Promise<boolean> {
  const r = await client.fetch(`${DIRECTORY}/${encodeURIComponent(groupEmail)}/members?maxResults=200`);
  if (!r.ok) throw new Error(`Looking up the members of ${groupEmail} failed: ${await errText(r)}`);
  const list = (((await r.json()) as { members?: { email?: string; role?: string }[] }).members ?? []).filter((m) => (m.role ?? "MEMBER") === "MEMBER");
  const me = personalEmail.trim().toLowerCase();
  const mine = new Set([me, gmailWithoutTag(me)].filter(Boolean));
  return list.length === 0 || list.some((m) => mine.has(String(m.email ?? "").toLowerCase()));
}

/**
 * Create (or reuse) the creator's inbox group, apply settings, add members.
 * `override`: admin-chosen address; only that one is tried.
 * Idempotent: an existing group whose name + description match ours is
 * treated as already created by us and reused.
 */
export async function provisionCreatorGroup(
  client: GroupsClient,
  input: { fullName: string; personalEmail: string; override?: string },
  opts: { retryDelayMs?: number } = {},
): Promise<ProvisionResult> {
  const name = groupDisplayName(input.fullName);
  const override = (input.override ?? "").trim().toLowerCase();
  const candidates = override ? [override] : candidateAddresses(input.fullName);
  if (!candidates.length) throw new Error("Creator has no name to build an address from.");
  if (override && !isKeshahAddress(override)) throw new Error(`${override} isn't a valid @${KESHAH_DOMAIN} address.`);

  const tried: string[] = [];
  let chosen: string | null = null;
  let created = false;
  for (const email of candidates) {
    tried.push(email);
    const g = await client.fetch(`${DIRECTORY}/${encodeURIComponent(email)}`);
    if (g.ok) {
      const existing = (await g.json()) as { name?: string; description?: string };
      // Ours from an earlier run, unless it's another creator's with the same
      // full name: then it has them as a member and we move on.
      if (existing.name === name && existing.description === GROUP_DESCRIPTION && (await groupIsFor(client, email, input.personalEmail))) {
        chosen = email;
        break;
      }
      continue; // taken by someone/something else
    }
    if (g.status !== 404) throw new Error(`Looking up ${email} failed: ${await errText(g)}`);
    const ins = await client.fetch(DIRECTORY, {
      method: "POST",
      body: JSON.stringify({ email, name, description: GROUP_DESCRIPTION }),
    });
    if (ins.status === 409) continue; // a user / alias / group already uses it
    if (!ins.ok) throw new Error(`Creating ${email} failed: ${await errText(ins)}`);
    chosen = email;
    created = true;
    break;
  }
  if (!chosen) {
    throw new Error(
      override
        ? `${override} is already taken. Pick another address in the editor and accept again.`
        : `All of ${tried.join(", ")} are taken. Set an address in the editor and accept again.`,
    );
  }

  // Settings. A brand new group can 404 here for a few seconds while it propagates.
  const delay = opts.retryDelayMs ?? 2000;
  for (let attempt = 1; ; attempt++) {
    const r = await client.fetch(`${SETTINGS}/${encodeURIComponent(chosen)}?alt=json`, {
      method: "PATCH",
      body: JSON.stringify(GROUP_SETTINGS),
    });
    if (r.ok) break;
    if (attempt < 5 && (r.status === 404 || r.status >= 500)) {
      await sleep(delay * attempt);
      continue;
    }
    throw new Error(`Group ${chosen} exists but its settings didn't save: ${await errText(r)}`);
  }

  // Members: creator (MEMBER) + admin (OWNER).
  const members: { email: string; role: "MEMBER" | "OWNER" }[] = [
    { email: input.personalEmail.trim().toLowerCase(), role: "MEMBER" },
    { email: client.adminEmail, role: "OWNER" },
  ];
  for (const m of members) {
    if (!m.email) continue;
    const r = await client.fetch(`${DIRECTORY}/${encodeURIComponent(chosen)}/members`, {
      method: "POST",
      body: JSON.stringify({ email: m.email, role: m.role }),
    });
    if (r.ok) continue;
    // Google rejects a Gmail "+tag" address ("Resource Not Found") because it
    // isn't its own account. Mail to the plain address reaches the same inbox.
    const plain = gmailWithoutTag(m.email);
    if (r.status === 404 && plain && plain !== m.email) {
      const r2 = await client.fetch(`${DIRECTORY}/${encodeURIComponent(chosen)}/members`, {
        method: "POST",
        body: JSON.stringify({ email: plain, role: m.role }),
      });
      if (r2.ok || r2.status === 409) continue;
    }
    if (r.status === 409) {
      // Already a member. Make sure the admin is an OWNER.
      if (m.role === "OWNER") {
        const p = await client.fetch(`${DIRECTORY}/${encodeURIComponent(chosen)}/members/${encodeURIComponent(m.email)}`, {
          method: "PATCH",
          body: JSON.stringify({ role: "OWNER" }),
        });
        if (!p.ok) throw new Error(`Couldn't make ${m.email} an owner of ${chosen}: ${await errText(p)}`);
      }
      continue;
    }
    throw new Error(`Adding ${m.role === "OWNER" ? "the admin" : "the creator"} to ${chosen} failed: ${await errText(r)}`);
  }
  return { email: chosen, created, tried };
}

/**
 * Take the creator's personal address off their inbox group (offer withdrawn).
 * The group itself stays, so nothing tied to the address breaks and it can be
 * reused. Already gone (404) counts as removed.
 */
export async function removeCreatorFromGroup(client: GroupsClient, input: { groupEmail: string; personalEmail: string }): Promise<{ removed: boolean }> {
  const group = input.groupEmail.trim().toLowerCase();
  const member = input.personalEmail.trim().toLowerCase();
  if (!isKeshahAddress(group)) throw new Error(`${group || "(none)"} isn't a @${KESHAH_DOMAIN} group.`);
  if (!member) throw new Error("No personal email to remove.");
  const r = await client.fetch(`${DIRECTORY}/${encodeURIComponent(group)}/members/${encodeURIComponent(member)}`, { method: "DELETE" });
  if (r.ok) return { removed: true };
  if (r.status === 404) {
    // They may have been added under the plain Gmail address (see provisioning).
    const plain = gmailWithoutTag(member);
    if (plain && plain !== member) {
      const r2 = await client.fetch(`${DIRECTORY}/${encodeURIComponent(group)}/members/${encodeURIComponent(plain)}`, { method: "DELETE" });
      if (r2.ok) return { removed: true };
    }
    return { removed: false };
  }
  throw new Error(`Removing ${member} from ${group} failed: ${await errText(r)}`);
}

/** "name+tag@gmail.com" → "name@gmail.com" (also googlemail.com); null for anything else. */
export function gmailWithoutTag(email: string): string | null {
  const m = /^([^+@]+)\+[^@]*@(gmail\.com|googlemail\.com)$/i.exec(email.trim());
  return m ? `${m[1]}@${m[2]}`.toLowerCase() : null;
}
