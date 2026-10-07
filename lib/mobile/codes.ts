/**
 * Email sign-in codes for the KESHAH Creators app.
 *
 * POST /api/mobile/auth/start issues a 6-digit code (valid 10 min, 5 tries),
 * POST /api/mobile/auth/verify checks it. Only an HMAC of the code is stored,
 * in mobile_auth_codes/{sha256(email)}. Sends are rate limited per email and
 * per IP (mobile_auth_ip/{sha256(ip)}).
 *
 * The state logic is pure and the store is an interface, so the whole flow is
 * unit tested against an in-memory store (lib/creators/mobile.test.ts).
 */
import { createHash, createHmac, randomInt, timingSafeEqual } from "crypto";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
/** Per email: at most this many codes per hour, and not more often than every 30 seconds. */
export const EMAIL_SENDS_PER_HOUR = 5;
export const EMAIL_MIN_GAP_MS = 30 * 1000;
/** Per IP: at most this many codes per hour (all emails). */
export const IP_SENDS_PER_HOUR = 20;
const HOUR = 60 * 60 * 1000;

export const CODES_COLLECTION = "mobile_auth_codes";
export const IP_COLLECTION = "mobile_auth_ip";

export interface CodeState {
  email: string;
  code_hash: string | null;
  expires_at_ms: number;
  attempts: number;
  used_at_ms: number | null;
  /** Send times in the last hour (for the per-email rate limit). */
  sends_ms: number[];
}

export interface IpState {
  sends_ms: number[];
}

export function sha256Hex(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

export function hashCode(email: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

function recent(sends: unknown, nowMs: number): number[] {
  return (Array.isArray(sends) ? sends : []).filter((t): t is number => typeof t === "number" && nowMs - t < HOUR);
}

export type IssueDecision =
  | { ok: true; state: CodeState; ip: IpState }
  | { ok: false; reason: "too_soon" | "email_limit" | "ip_limit"; state: CodeState | null; ip: IpState | null };

/** Decide whether a new code can be sent; on ok, the states to store (old code replaced, tries reset). */
export function planIssue(
  prev: CodeState | null,
  prevIp: IpState | null,
  input: { email: string; codeHash: string; nowMs: number },
): IssueDecision {
  const sends = recent(prev?.sends_ms, input.nowMs);
  const ipSends = recent(prevIp?.sends_ms, input.nowMs);
  const last = sends.length ? Math.max(...sends) : 0;
  if (last && input.nowMs - last < EMAIL_MIN_GAP_MS) return { ok: false, reason: "too_soon", state: null, ip: null };
  if (sends.length >= EMAIL_SENDS_PER_HOUR) return { ok: false, reason: "email_limit", state: null, ip: null };
  if (ipSends.length >= IP_SENDS_PER_HOUR) return { ok: false, reason: "ip_limit", state: null, ip: null };
  return {
    ok: true,
    state: {
      email: input.email,
      code_hash: input.codeHash,
      expires_at_ms: input.nowMs + CODE_TTL_MS,
      attempts: 0,
      used_at_ms: null,
      sends_ms: [...sends, input.nowMs],
    },
    ip: { sends_ms: [...ipSends, input.nowMs] },
  };
}

export type CheckResult = "ok" | "wrong" | "expired" | "too_many" | "none";

/** Check a typed code. Always returns the state to store (a wrong try counts; a right one burns the code). */
export function checkCode(
  state: CodeState | null,
  input: { codeHash: string; nowMs: number },
): { result: CheckResult; state: CodeState | null; attemptsLeft: number } {
  if (!state || !state.code_hash || state.used_at_ms) return { result: "none", state, attemptsLeft: 0 };
  if (state.attempts >= MAX_ATTEMPTS) return { result: "too_many", state, attemptsLeft: 0 };
  if (input.nowMs >= state.expires_at_ms) return { result: "expired", state, attemptsLeft: 0 };
  const a = Buffer.from(state.code_hash, "hex");
  const b = Buffer.from(input.codeHash, "hex");
  const match = a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  if (match) return { result: "ok", state: { ...state, used_at_ms: input.nowMs, code_hash: null }, attemptsLeft: 0 };
  const attempts = state.attempts + 1;
  return {
    result: attempts >= MAX_ATTEMPTS ? "too_many" : "wrong",
    state: { ...state, attempts },
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - attempts),
  };
}

/** Read-modify-write store. Firestore implements it with a transaction. */
export interface CodeStore {
  issue(
    emailKey: string,
    ipKey: string,
    decide: (prev: CodeState | null, prevIp: IpState | null) => IssueDecision,
  ): Promise<IssueDecision>;
  check(emailKey: string, decide: (prev: CodeState | null) => ReturnType<typeof checkCode>): Promise<ReturnType<typeof checkCode>>;
}

export async function issueCode(
  store: CodeStore,
  input: { email: string; ip: string; secret: string; nowMs?: number; code?: string },
): Promise<{ ok: true; code: string } | { ok: false; reason: "too_soon" | "email_limit" | "ip_limit" }> {
  const nowMs = input.nowMs ?? Date.now();
  const code = input.code ?? newCode();
  const codeHash = hashCode(input.email, code, input.secret);
  const d = await store.issue(sha256Hex(input.email), sha256Hex(input.ip || "unknown"), (prev, prevIp) =>
    planIssue(prev, prevIp, { email: input.email, codeHash, nowMs }),
  );
  return d.ok ? { ok: true, code } : { ok: false, reason: d.reason };
}

export async function verifyCode(
  store: CodeStore,
  input: { email: string; code: string; secret: string; nowMs?: number },
): Promise<{ result: CheckResult; attemptsLeft: number }> {
  const nowMs = input.nowMs ?? Date.now();
  const clean = String(input.code ?? "").replace(/\D/g, "");
  const codeHash = hashCode(input.email, clean, input.secret);
  const r = await store.check(sha256Hex(input.email), (prev) => {
    if (clean.length !== 6) {
      // Malformed input still counts as a try, so it can't be used to probe for free.
      const c = checkCode(prev, { codeHash: "00", nowMs });
      return c.result === "ok" ? { ...c, result: "wrong" as const } : c;
    }
    return checkCode(prev, { codeHash, nowMs });
  });
  return { result: r.result, attemptsLeft: r.attemptsLeft };
}

/** In-memory store for tests. */
export function memoryCodeStore(): CodeStore & { codes: Map<string, CodeState>; ips: Map<string, IpState> } {
  const codes = new Map<string, CodeState>();
  const ips = new Map<string, IpState>();
  return {
    codes,
    ips,
    async issue(emailKey, ipKey, decide) {
      const d = decide(codes.get(emailKey) ?? null, ips.get(ipKey) ?? null);
      if (d.ok) {
        codes.set(emailKey, d.state);
        ips.set(ipKey, d.ip);
      }
      return d;
    },
    async check(emailKey, decide) {
      const r = decide(codes.get(emailKey) ?? null);
      if (r.state) codes.set(emailKey, r.state);
      return r;
    },
  };
}

export function codeEmail(code: string): { subject: string; text: string } {
  return {
    subject: "Your KESHAH Creators code",
    text: [
      `Your KESHAH Creators code is ${code}.`,
      "Type it into the app to sign in. It works for the next 10 minutes.",
      "If you didn't ask for this, you can ignore this email.",
    ].join("\n\n"),
  };
}

export const ISSUE_ERRORS: Record<"too_soon" | "email_limit" | "ip_limit", string> = {
  too_soon: "We just sent you a code. Wait 30 seconds before asking for another one.",
  email_limit: "You've asked for a lot of codes. Wait a bit and try again.",
  ip_limit: "Too many sign-in attempts from here. Wait a bit and try again.",
};

export function checkError(result: Exclude<CheckResult, "ok">, attemptsLeft: number): { error: string; status: number } {
  switch (result) {
    case "wrong":
      return {
        error: `That code isn't right. You have ${attemptsLeft} ${attemptsLeft === 1 ? "try" : "tries"} left.`,
        status: 400,
      };
    case "too_many":
      return { error: "Too many wrong tries. Ask for a new code.", status: 429 };
    case "expired":
      return { error: "That code has expired. Ask for a new one.", status: 400 };
    default:
      return { error: "Ask for a code first.", status: 400 };
  }
}
