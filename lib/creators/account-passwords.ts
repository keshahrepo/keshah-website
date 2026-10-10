/**
 * Saved passwords for each creator's KESHAH TikTok and Instagram accounts (server only).
 *
 * The accounts belong to KESHAH: the creator signs up with their @keshah.com
 * address and a password we generate, so the founder can always get back in
 * with the email alone.
 *
 * Firestore (Admin SDK only; client rules never allow ContentCreators/{id}/private/**)
 *   ContentCreators/{id}/private/account_password_tiktok
 *   ContentCreators/{id}/private/account_password_instagram
 *     { platform, password: Sealed, created_at, updated_at, set_by: "generated" | "founder", updated_by? }
 *   ContentCreators/{id}/private/payment/reveal_log/{auto}
 *     every founder reveal ("reveal_tiktok_password") and save ("set_tiktok_password"),
 *     the same audit log as the bank / tax form reveals. Never holds the password.
 *
 * Passwords are AES-256-GCM sealed with CREATOR_DATA_KEY (lib/creators/secure.ts),
 * bound to "acctpw:<platform>:<creatorId>" so a sealed value can't be moved
 * onto another creator or platform. Plaintext only ever leaves through the
 * creator's own GET and the founder's logged reveal.
 */
import { randomInt } from "crypto";
import type { DocumentData } from "firebase-admin/firestore";
import { CreatorDataError } from "./db";
import { DecryptError, PaymentsDisabledError, encryptionConfigured, openBuffer, sealBuffer, type Sealed } from "./secure";
import { PASSWORD_WORDS } from "./password-words";
import type { AdminActor } from "./payments";

export const SOCIAL_PLATFORMS = ["tiktok", "instagram"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const PASSWORDS_DISABLED_MESSAGE = "Saved passwords aren't switched on yet.";

export function isSocialPlatform(v: unknown): v is SocialPlatform {
  return typeof v === "string" && (SOCIAL_PLATFORMS as readonly string[]).includes(v);
}

export function platformLabel(p: SocialPlatform): string {
  return p === "tiktok" ? "TikTok" : "Instagram";
}

// ---------------------------------------------------------------- generation

/** TikTok allows 8 to 20 characters; Instagram needs at least 6. */
export const PASSWORD_MAX = 20;

/**
 * "Maple-river-cloud-42": three common words (first one capitalised), dashes,
 * two digits. Easy to type on a phone, and it has upper and lower case letters,
 * numbers and a symbol, so it passes TikTok's and Instagram's rules.
 * Crypto-secure randomness; about 37 bits (1,200+ words cubed times 90).
 */
export function generateAccountPassword(rand: (min: number, max: number) => number = randomInt): string {
  const word = () => PASSWORD_WORDS[rand(0, PASSWORD_WORDS.length)];
  const [a, b, c] = [word(), word(), word()];
  const digits = String(rand(10, 100)); // always two digits, never a leading zero
  return `${a[0].toUpperCase()}${a.slice(1)}-${b}-${c}-${digits}`;
}

export const GENERATED_PASSWORD_RE = /^[A-Z][a-z]{2,4}-[a-z]{3,5}-[a-z]{3,5}-[1-9][0-9]$/;

/** A password the founder typed after resetting an account. Returns the error message, or null. */
export function founderPasswordProblem(v: unknown): string | null {
  if (typeof v !== "string" || !v) return "Type the new password.";
  if (v !== v.trim()) return "Take out the spaces at the start or end.";
  if (/[\r\n\t]/.test(v)) return "The password can't have line breaks.";
  if (v.length < 6) return "That's too short. Instagram needs at least 6 characters.";
  if (v.length > 128) return "That's too long.";
  return null;
}

// ---------------------------------------------------------------- storage

export interface AccountPasswordRecord {
  platform: SocialPlatform;
  password: Sealed;
  created_at: string;
  updated_at: string;
  set_by: "generated" | "founder";
  /** Founder (actor.who) for set_by "founder". */
  updated_by?: string;
}

export interface AccountPasswordStore {
  get(creatorId: string, platform: SocialPlatform): Promise<AccountPasswordRecord | null>;
  /** Saves [rec] unless a record already exists (atomically); returns whichever is stored. */
  createIfMissing(creatorId: string, platform: SocialPlatform, rec: AccountPasswordRecord): Promise<AccountPasswordRecord>;
  put(creatorId: string, platform: SocialPlatform, rec: AccountPasswordRecord): Promise<void>;
  creatorExists(creatorId: string): Promise<boolean>;
  /** Append to the creator's reveal_log. Must throw if the write fails (then nothing is revealed). */
  log(creatorId: string, action: string, actor: AdminActor, extra?: Record<string, unknown>): Promise<void>;
}

const context = (creatorId: string, platform: SocialPlatform) => `acctpw:${platform}:${creatorId}`;

export interface CryptoOpts {
  /** Tests only: an explicit 32-byte key instead of CREATOR_DATA_KEY. */
  key?: Buffer;
  now?: () => Date;
}

function requireEnabled(opts: CryptoOpts) {
  if (!opts.key && !encryptionConfigured()) throw new CreatorDataError(PASSWORDS_DISABLED_MESSAGE, 503);
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof PaymentsDisabledError) throw new CreatorDataError(PASSWORDS_DISABLED_MESSAGE, 503);
    if (e instanceof DecryptError) throw new CreatorDataError("This password couldn't be decrypted. Set a new one.", 500);
    throw e;
  }
}

function seal(creatorId: string, platform: SocialPlatform, plain: string, opts: CryptoOpts): Sealed {
  return guard(() => sealBuffer(Buffer.from(plain, "utf8"), context(creatorId, platform), opts.key));
}

function open(creatorId: string, platform: SocialPlatform, rec: AccountPasswordRecord, opts: CryptoOpts): string {
  return guard(() => openBuffer(rec.password, context(creatorId, platform), opts.key).toString("utf8"));
}

/** The creator's password for one platform, generated (and saved) the first time it's asked for. */
export async function ensureAccountPassword(
  store: AccountPasswordStore,
  creatorId: string,
  platform: SocialPlatform,
  opts: CryptoOpts = {},
): Promise<string> {
  requireEnabled(opts);
  const existing = await store.get(creatorId, platform);
  if (existing) return open(creatorId, platform, existing, opts);
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const rec: AccountPasswordRecord = {
    platform,
    password: seal(creatorId, platform, generateAccountPassword(), opts),
    created_at: now,
    updated_at: now,
    set_by: "generated",
  };
  // Two first opens at once: the transaction keeps one, and both get that one.
  const stored = await store.createIfMissing(creatorId, platform, rec);
  return open(creatorId, platform, stored, opts);
}

/** Creator GET: both of their own passwords. */
export async function creatorAccountPasswords(store: AccountPasswordStore, creatorId: string, opts: CryptoOpts = {}) {
  const [tiktok, instagram] = await Promise.all(SOCIAL_PLATFORMS.map((p) => ensureAccountPassword(store, creatorId, p, opts)));
  return { tiktok, instagram };
}

/** Founder: whether each password exists (never the value). */
export async function accountPasswordStatus(store: AccountPasswordStore, creatorId: string) {
  const out = {} as Record<SocialPlatform, { saved: boolean; set_by: string | null; updated_at: string | null }>;
  for (const p of SOCIAL_PLATFORMS) {
    const r = await store.get(creatorId, p);
    out[p] = { saved: !!r, set_by: r?.set_by ?? null, updated_at: r?.updated_at ?? null };
  }
  return out;
}

/** Founder reveal. Logged BEFORE decrypting: if the log write fails, nothing is revealed. */
export async function revealAccountPassword(
  store: AccountPasswordStore,
  creatorId: string,
  platform: SocialPlatform,
  actor: AdminActor,
  opts: CryptoOpts = {},
): Promise<string> {
  requireEnabled(opts);
  const rec = await store.get(creatorId, platform);
  if (!rec) {
    if (!(await store.creatorExists(creatorId))) throw new CreatorDataError("Creator not found", 404);
    throw new CreatorDataError(`No ${platformLabel(platform)} password yet. It's made when they open the account step.`, 404);
  }
  await store.log(creatorId, `reveal_${platform}_password`, actor, { platform });
  return open(creatorId, platform, rec, opts);
}

/** Founder save after resetting the account. Logged (without the value). */
export async function setAccountPassword(
  store: AccountPasswordStore,
  creatorId: string,
  platform: SocialPlatform,
  password: unknown,
  actor: AdminActor,
  opts: CryptoOpts = {},
): Promise<{ platform: SocialPlatform; set_by: "founder"; updated_at: string }> {
  requireEnabled(opts);
  const problem = founderPasswordProblem(password);
  if (problem) throw new CreatorDataError(problem, 400);
  if (!(await store.creatorExists(creatorId))) throw new CreatorDataError("Creator not found", 404);
  const now = (opts.now ?? (() => new Date()))().toISOString();
  const prev = await store.get(creatorId, platform);
  const rec: AccountPasswordRecord = {
    platform,
    password: seal(creatorId, platform, password as string, opts),
    created_at: prev?.created_at ?? now,
    updated_at: now,
    set_by: "founder",
    updated_by: actor.who,
  };
  await store.log(creatorId, `set_${platform}_password`, actor, { platform });
  await store.put(creatorId, platform, rec);
  return { platform, set_by: "founder", updated_at: now };
}

// ---------------------------------------------------------------- Firestore

/** The real store: private docs under the creator, reveal_log shared with payments. */
export async function firestoreAccountPasswordStore(): Promise<AccountPasswordStore> {
  const [{ getFirebaseAdmin }, { CREATORS_COLLECTION }, { logReveal }] = await Promise.all([
    import("@/lib/firebase-admin"),
    import("./db"),
    import("./payments"),
  ]);
  const db = getFirebaseAdmin().db;
  const creator = (id: string) => db.collection(CREATORS_COLLECTION).doc(id);
  const ref = (id: string, p: SocialPlatform) => creator(id).collection("private").doc(`account_password_${p}`);
  const parse = (d: DocumentData | undefined): AccountPasswordRecord | null =>
    d && d.password ? (d as AccountPasswordRecord) : null;
  const clean = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
  return {
    async get(id, p) {
      return parse((await ref(id, p).get()).data());
    },
    async createIfMissing(id, p, rec) {
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref(id, p));
        const have = parse(snap.data());
        if (have) return have;
        tx.set(ref(id, p), clean(rec));
        return rec;
      });
    },
    async put(id, p, rec) {
      await ref(id, p).set(clean(rec));
    },
    async creatorExists(id) {
      return (await creator(id).get()).exists;
    },
    async log(id, action, actor, extra = {}) {
      await logReveal(id, action, actor, extra);
    },
  };
}
