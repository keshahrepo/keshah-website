/**
 * Adopted-signature text. Safe for both server (signed PDF) and client (preview).
 *
 * The typed name is kept as typed in the audit record (signer_typed_name). The
 * drawn signature uses this text: whitespace squashed, and a name typed all in
 * lowercase or all in capitals is shown in Title Case ("maria gomez" and
 * "MARIA GOMEZ" both become "Maria Gomez"). Mixed case is left exactly as typed.
 */
export function adoptedSignatureText(typed: string): string {
  const s = String(typed ?? "").trim().replace(/\s+/g, " ");
  if (!/\p{L}/u.test(s)) return s;
  const allLower = s === s.toLowerCase();
  const allUpper = s === s.toUpperCase();
  if (!allLower && !allUpper) return s;
  return s.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toUpperCase());
}
