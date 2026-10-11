/**
 * Bearer tokens for the KESHAH Creators app (com.keshah.creators).
 *
 * HS256 JWTs signed with MOBILE_JWT_SECRET (separate from the dashboard's
 * JWT_SECRET, so a dashboard cookie can never be replayed as a mobile token
 * or the other way round). Claims: { sub: email, role, cid?, aid? }.
 * No Firestore here, so it's unit tested in lib/creators/mobile.test.ts.
 */
import { SignJWT, jwtVerify } from "jose";

export type MobileRole = "creator" | "applicant" | "none";

/**
 * How the person proved who they are when this token was issued (recorded on
 * e-signature audit trails): an emailed 6-digit code, Google / Apple sign-in
 * (social: provider unknown), or the App Review demo account's fixed code.
 * Tokens issued before this existed have none.
 */
export type SignInMethod = "email_code" | "google" | "apple" | "social" | "demo";
const SIGN_IN_METHODS: readonly string[] = ["email_code", "google", "apple", "social", "demo"];

export interface MobileClaims {
  /** Lowercased email the code was sent to. */
  sub: string;
  role: MobileRole;
  /** ContentCreators doc id (role creator). */
  cid?: string;
  /** careers_applications doc id (role applicant). */
  aid?: string;
  /** How they signed in (see SignInMethod). */
  amr?: SignInMethod;
}

const ISSUER = "keshah-creators";
export const MOBILE_OFF_MESSAGE = "Mobile sign-in isn't switched on yet";

function secretBytes(secret = process.env.MOBILE_JWT_SECRET): Uint8Array | null {
  const s = (secret ?? "").trim();
  return s ? new TextEncoder().encode(s) : null;
}

export function mobileAuthConfigured(secret?: string): boolean {
  return !!secretBytes(secret ?? process.env.MOBILE_JWT_SECRET);
}

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const e = raw.trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

export async function signMobileToken(claims: MobileClaims, opts: { secret?: string; now?: Date } = {}): Promise<string> {
  const key = secretBytes(opts.secret ?? process.env.MOBILE_JWT_SECRET);
  if (!key) throw new Error(MOBILE_OFF_MESSAGE);
  const body: Record<string, unknown> = { role: claims.role };
  if (claims.cid) body.cid = claims.cid;
  if (claims.aid) body.aid = claims.aid;
  if (claims.amr) body.amr = claims.amr;
  const iat = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT(body)
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 180 * 24 * 60 * 60)
    .sign(key);
}

/** Claims for a valid, unexpired token signed with our secret; otherwise null. */
export async function verifyMobileToken(token: string, opts: { secret?: string; now?: Date } = {}): Promise<MobileClaims | null> {
  const key = secretBytes(opts.secret ?? process.env.MOBILE_JWT_SECRET);
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      algorithms: ["HS256"],
      ...(opts.now ? { currentDate: opts.now } : {}),
    });
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const role = payload.role;
    if (!sub || (role !== "creator" && role !== "applicant" && role !== "none")) return null;
    return {
      sub,
      role,
      ...(typeof payload.cid === "string" && payload.cid ? { cid: payload.cid } : {}),
      ...(typeof payload.aid === "string" && payload.aid ? { aid: payload.aid } : {}),
      ...(typeof payload.amr === "string" && SIGN_IN_METHODS.includes(payload.amr) ? { amr: payload.amr as SignInMethod } : {}),
    };
  } catch {
    return null;
  }
}

/** The token from "Authorization: Bearer <token>", or null when there's no bearer header. */
export function bearerToken(headers: Headers): string | null {
  const h = headers.get("authorization") ?? "";
  const m = h.match(/^Bearer\s+(\S+)\s*$/i);
  return m ? m[1] : null;
}

// ---------------------------------------------------------------- link tokens

/**
 * Short-lived token handed back by /api/mobile/auth/firebase when a Google /
 * Apple sign-in needs linking to an application email (Apple private relay,
 * or an email we don't know). Carries only the Firebase uid. It has no role,
 * so verifyMobileToken never accepts it as a session.
 */
const LINK_AUDIENCE = "keshah-creators-link";
export const LINK_TTL_SECONDS = 30 * 60;

export async function signLinkToken(uid: string, opts: { secret?: string; now?: Date } = {}): Promise<string> {
  const key = secretBytes(opts.secret ?? process.env.MOBILE_JWT_SECRET);
  if (!key) throw new Error(MOBILE_OFF_MESSAGE);
  const iat = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  return new SignJWT({ typ: "link" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(uid)
    .setIssuer(ISSUER)
    .setAudience(LINK_AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + LINK_TTL_SECONDS)
    .sign(key);
}

/** The Firebase uid inside a valid, unexpired link token, else null. */
export async function verifyLinkToken(token: unknown, opts: { secret?: string; now?: Date } = {}): Promise<string | null> {
  const key = secretBytes(opts.secret ?? process.env.MOBILE_JWT_SECRET);
  if (!key || typeof token !== "string" || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: LINK_AUDIENCE,
      algorithms: ["HS256"],
      ...(opts.now ? { currentDate: opts.now } : {}),
    });
    return payload.typ === "link" && typeof payload.sub === "string" && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}
