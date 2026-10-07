// Interview texts via HiBlue (DISABLED until the HiBlue API is wired up).
//
// Turn on by setting both env vars in Vercel:
//   HIUBLUE_API_KEY   HiBlue API key
//   HIUBLUE_LINE      the sending line in E.164, e.g. +13473312820
//
// Until the HTTP call below is written, sendInterviewText always returns
// { skipped }, so callers never mark a text as sent. Every text carries
// kind "interview" so HiBlue paywall attribution can ignore these
// conversations later.

export type InterviewTextKind = "interview";

export type SendTextResult =
  | { sent: true; id: string | null }
  | { skipped: string }
  | { error: string };

export function smsConfigured(): boolean {
  return !!(process.env.HIUBLUE_API_KEY && process.env.HIUBLUE_LINE);
}

/** True only when the text actually went out. */
export function textWasSent(r: SendTextResult): r is { sent: true; id: string | null } {
  return "sent" in r && r.sent === true;
}

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

/** What the HiBlue send call will receive once it's implemented. */
export type HiBlueSendRequest = {
  apiKey: string;
  from: string; // HIUBLUE_LINE, E.164
  to: string; // E.164
  text: string;
  metadata: { kind: InterviewTextKind; ref?: string };
};

// TODO(hiblue): implement once the founder shares HiBlue's API docs.
// Make the HTTP request, return { sent: true, id } on success (id = HiBlue's
// message id if it returns one) and { error } on any failure. Pass
// metadata.kind = "interview" in whatever field HiBlue offers for tags or
// custom metadata, so paywall attribution can skip these threads.
async function hiBlueSend(req: HiBlueSendRequest): Promise<SendTextResult> {
  void req;
  return { skipped: "HiBlue send not implemented yet" };
}

export async function sendInterviewText(opts: {
  to: string;
  text: string;
  /** Optional reference (e.g. application id) passed along as metadata. */
  ref?: string;
}): Promise<SendTextResult> {
  if (!smsConfigured()) return { skipped: "not configured" };
  const to = normalizePhone(opts.to);
  if (!to) return { skipped: "invalid phone number" };
  try {
    return await hiBlueSend({
      apiKey: process.env.HIUBLUE_API_KEY!,
      from: process.env.HIUBLUE_LINE!,
      to,
      text: opts.text,
      metadata: { kind: "interview", ...(opts.ref ? { ref: opts.ref } : {}) },
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
