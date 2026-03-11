import { createHash, randomBytes } from "crypto";

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const s = salt || randomBytes(16).toString("hex");
  const hash = createHash("sha256").update(password + s).digest("hex");
  return { hash, salt: s };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const computed = createHash("sha256").update(password + salt).digest("hex");
  return computed === hash;
}

export function generateToken(): string {
  return randomBytes(24).toString("hex");
}
