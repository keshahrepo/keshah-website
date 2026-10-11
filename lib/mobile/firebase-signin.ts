/**
 * "Continue with Google" / "Continue with Apple" for the KESHAH Creators app.
 *
 * The app signs in with Firebase Auth (project keshah-app) and sends us the
 * Firebase ID token. We verify it, then pick the email to resolve:
 *   1. a stored link, mobile_identity_links/{uid}.email (set after an Apple
 *      relay user, or anyone whose sign-in email we don't know, proves their
 *      application email with a code), else
 *   2. the token's verified email, lowercased.
 * Apple private relay emails, unverified or missing emails, and emails that
 * resolve to role "none" (with no link) get { needs_link, link_token } so the
 * app can ask for the email they applied with.
 *
 * Everything external is injected; unit tested in lib/creators/mobile.test.ts.
 */
import { claimsFor, pickRole, type Identity, type IdentityLookup } from "./identity";
import { signLinkToken, signMobileToken, type SignInMethod } from "./token";

export const LINKS_COLLECTION = "mobile_identity_links";
export const APPLE_RELAY_DOMAIN = "privaterelay.appleid.com";

export interface DecodedIdToken {
  uid: string;
  email?: string;
  email_verified?: boolean;
  /** "google.com" / "apple.com" (firebase-admin's decoded token carries it). */
  firebase?: { sign_in_provider?: string };
}

/** The token's sign-in method for a Firebase (Google / Apple) sign-in. */
export function socialMethod(decoded: DecodedIdToken): SignInMethod {
  const p = decoded.firebase?.sign_in_provider;
  return p === "google.com" ? "google" : p === "apple.com" ? "apple" : "social";
}

export interface LinkStore {
  get(uid: string): Promise<{ email: string } | null>;
  set(uid: string, rec: { email: string; linked_at: string }): Promise<void>;
}

export interface FirebaseSignInDeps {
  verifyIdToken(idToken: string): Promise<DecodedIdToken>;
  links: LinkStore;
  identity: IdentityLookup;
  secret?: string;
  now?: Date;
}

export type SessionBody = { token: string } & Identity;
export type FirebaseSignInResult =
  | { ok: true; body: SessionBody }
  | { ok: true; body: { needs_link: true; link_token: string } }
  | { ok: false; status: number; error: string };

export function isAppleRelay(email: string): boolean {
  return email.toLowerCase().endsWith(`@${APPLE_RELAY_DOMAIN}`);
}

export async function sessionFor(
  identity: IdentityLookup,
  email: string,
  opts: { secret?: string; now?: Date; amr?: SignInMethod } = {},
): Promise<SessionBody> {
  const id = await pickRole(identity, email);
  const token = await signMobileToken({ ...claimsFor(id), ...(opts.amr ? { amr: opts.amr } : {}) }, { secret: opts.secret, now: opts.now });
  return { token, ...id };
}

export async function firebaseSignIn(deps: FirebaseSignInDeps, idToken: unknown): Promise<FirebaseSignInResult> {
  if (typeof idToken !== "string" || !idToken.trim()) return { ok: false, status: 400, error: "Missing sign-in token." };
  let decoded: DecodedIdToken;
  try {
    decoded = await deps.verifyIdToken(idToken.trim());
  } catch {
    return { ok: false, status: 401, error: "That sign-in didn't work. Try again." };
  }
  if (!decoded?.uid) return { ok: false, status: 401, error: "That sign-in didn't work. Try again." };
  const opts = { secret: deps.secret, now: deps.now };
  const needsLink = async (): Promise<FirebaseSignInResult> => ({
    ok: true,
    body: { needs_link: true, link_token: await signLinkToken(decoded.uid, opts) },
  });

  const link = await deps.links.get(decoded.uid);
  if (link?.email) return { ok: true, body: await sessionFor(deps.identity, link.email.toLowerCase(), { ...opts, amr: socialMethod(decoded) }) };

  const email = (decoded.email ?? "").trim().toLowerCase();
  if (!email || decoded.email_verified === false || isAppleRelay(email)) return needsLink();
  const id = await pickRole(deps.identity, email);
  if (id.role === "none") return needsLink();
  return { ok: true, body: { token: await signMobileToken({ ...claimsFor(id), amr: socialMethod(decoded) }, opts), ...id } };
}

/** After the emailed code checks out: store the link and sign in as that email. */
export async function completeLink(
  deps: Pick<FirebaseSignInDeps, "links" | "identity" | "secret" | "now">,
  uid: string,
  email: string,
): Promise<SessionBody> {
  await deps.links.set(uid, { email, linked_at: (deps.now ?? new Date()).toISOString() });
  // They just typed the code emailed to this address.
  return sessionFor(deps.identity, email, { secret: deps.secret, now: deps.now, amr: "email_code" });
}
