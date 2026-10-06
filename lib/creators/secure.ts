/**
 * App-level encryption for creator payment data (server only).
 *
 * AES-256-GCM with a key from env CREATOR_DATA_KEY (base64 of exactly 32
 * random bytes). Every value gets a fresh random 12-byte IV and is stored as
 *   { v: 1, iv, tag, ct }   (all base64)
 * Files (Buffers) are sealed the same way and the JSON envelope is what gets
 * uploaded to Storage, so a leaked bucket object or Firestore doc is useless
 * without the key.
 *
 * An optional "context" string is bound in as GCM additional data (e.g.
 * "bank:<creatorId>"), so a sealed value copied onto another creator, or
 * into another field, fails to open.
 *
 * Fails closed: with no key (or a malformed one) every call throws
 * PaymentsDisabledError and nothing is written.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

export const KEY_ENV = "CREATOR_DATA_KEY";
export const PAYMENTS_DISABLED_MESSAGE = "Payments setup isn't switched on yet.";

export interface Sealed {
  v: 1;
  iv: string;
  tag: string;
  ct: string;
}

export class PaymentsDisabledError extends Error {
  status = 503;
  constructor(detail?: string) {
    super(PAYMENTS_DISABLED_MESSAGE);
    this.name = "PaymentsDisabledError";
    if (detail) console.error(`creator payments disabled: ${detail}`);
  }
}

export class DecryptError extends Error {
  constructor() {
    super("This record couldn't be decrypted. It may have been changed, or it was saved with a different key.");
    this.name = "DecryptError";
  }
}

/** Parse a base64 key. Returns null unless it decodes to exactly 32 bytes. */
export function parseKey(raw: string | undefined | null): Buffer | null {
  const s = String(raw ?? "").trim();
  if (!s || !/^[A-Za-z0-9+/_-]+=*$/.test(s)) return null;
  const buf = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  return buf.length === 32 ? buf : null;
}

function envKey(): Buffer {
  const raw = process.env[KEY_ENV];
  if (!raw) throw new PaymentsDisabledError(`${KEY_ENV} is not set`);
  const key = parseKey(raw);
  if (!key) throw new PaymentsDisabledError(`${KEY_ENV} must be base64 of exactly 32 bytes`);
  return key;
}

/** True when CREATOR_DATA_KEY is present and valid (the feature is switched on). */
export function encryptionConfigured(): boolean {
  return parseKey(process.env[KEY_ENV]) !== null;
}

export function sealBuffer(plain: Buffer | Uint8Array, context = "", key: Buffer = envKey()): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  if (context) cipher.setAAD(Buffer.from(context, "utf8"));
  const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { v: 1, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), ct: ct.toString("base64") };
}

export function isSealed(v: unknown): v is Sealed {
  const s = v as Partial<Sealed> | null;
  return !!s && s.v === 1 && typeof s.iv === "string" && typeof s.tag === "string" && typeof s.ct === "string";
}

export function openBuffer(sealed: unknown, context = "", key: Buffer = envKey()): Buffer {
  if (!isSealed(sealed)) throw new DecryptError();
  try {
    const iv = Buffer.from(sealed.iv, "base64");
    const tag = Buffer.from(sealed.tag, "base64");
    if (iv.length !== 12 || tag.length !== 16) throw new DecryptError();
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    if (context) decipher.setAAD(Buffer.from(context, "utf8"));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(Buffer.from(sealed.ct, "base64")), decipher.final()]);
  } catch {
    throw new DecryptError();
  }
}

export function sealJson(value: unknown, context = "", key?: Buffer): Sealed {
  return sealBuffer(Buffer.from(JSON.stringify(value), "utf8"), context, key);
}

export function openJson<T = unknown>(sealed: unknown, context = "", key?: Buffer): T {
  return JSON.parse(openBuffer(sealed, context, key).toString("utf8")) as T;
}

/** Storage object body for a sealed file: the JSON envelope. */
export function sealFile(plain: Buffer | Uint8Array, context = "", key?: Buffer): Buffer {
  return Buffer.from(JSON.stringify(sealBuffer(plain, context, key)), "utf8");
}

export function openFile(body: Buffer, context = "", key?: Buffer): Buffer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.toString("utf8"));
  } catch {
    throw new DecryptError();
  }
  return openBuffer(parsed, context, key);
}
