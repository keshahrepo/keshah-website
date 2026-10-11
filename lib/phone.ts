// Phone number rules shared by the apply form (client) and the server.
// Pure, no imports, so the browser bundle can use it.

/**
 * E.164 for a phone number typed on the apply form, or null when we can't be
 * sure. Accepts "+<country><number>" (8 to 15 digits) or a US number with 10
 * digits (optionally a leading 1).
 */
export function normalizePhone(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (!s) return null;
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) {
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== "0" ? `+${digits}` : null;
  }
  if (digits.length === 10 && /^[2-9]/.test(digits)) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1") && /^[2-9]/.test(digits.slice(1))) return `+${digits}`;
  return null;
}

/** Shown under the phone field when the number can't be used for texts. */
export const PHONE_HINT = "Include your country code, e.g. +1 for the US";

/** The SMS consent line under the phone field (also stored on the application). */
export const SMS_CONSENT_LINE = "We'll text you about your interview. Reply STOP to opt out.";
