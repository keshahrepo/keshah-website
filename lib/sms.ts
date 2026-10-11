// Interview texts via HiBlue (api.hiublue.com/api/v2, POST
// /conversations/send-message, bearer auth).
//
// On when HIUBLUE_API_KEY is set in Vercel. Texts go out through the
// existing "Keshah Paywall Outreach" integration (it owns our only line,
// (347) 331-2820); override with HIUBLUE_INTEGRATION_ID. Every message_id
// starts with "interview_" and location_id is "keshah_interviews", so the
// paywall webhook/attribution can tell these apart from paywall outreach.

export type InterviewTextKind = "interview";

export type SendTextResult =
  | { sent: true; id: string | null }
  | { skipped: string }
  | { error: string };

const HIUBLUE_SEND_URL = "https://api.hiublue.com/api/v2/conversations/send-message";
const DEFAULT_INTEGRATION_ID = "484ef85c-b57d-4144-b789-4908eef5dbe1"; // Keshah Paywall Outreach

export function smsConfigured(): boolean {
  return !!process.env.HIUBLUE_API_KEY;
}

/** True only when the text actually went out. */
export function textWasSent(r: SendTextResult): r is { sent: true; id: string | null } {
  return "sent" in r && r.sent === true;
}

export { normalizePhone } from "./phone";
import { normalizePhone } from "./phone";

/** What the HiBlue send call will receive once it's implemented. */
export type HiBlueSendRequest = {
  apiKey: string;
  integrationId: string;
  to: string; // E.164
  text: string;
  metadata: { kind: InterviewTextKind; ref?: string };
};

async function hiBlueSend(req: HiBlueSendRequest, fetchImpl: typeof fetch = fetch): Promise<SendTextResult> {
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const ref = (req.metadata.ref ?? "x").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 60);
  const messageId = `interview_${ref}_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
  const res = await fetchImpl(HIUBLUE_SEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${req.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      location_id: "keshah_interviews",
      contact_id: ref,
      phone: req.to,
      message: req.text,
      message_id: messageId,
      integration_id: req.integrationId,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    return { error: `HiBlue HTTP ${res.status}: ${body.slice(0, 200)}` };
  }
  return { sent: true, id: messageId };
}

/** One outbound applicant text, as logged to applicant_messages. */
export type OutboundTextRecord = {
  application_id: string | null;
  phone: string;
  text: string;
  message_id: string | null;
  kind: string;
};

async function defaultIsOptedOut(phone: string): Promise<boolean> {
  // Lazy so this module stays importable without Firestore (unit tests).
  const { isSmsOptedOut } = await import("./applicant-inbox-firestore");
  return isSmsOptedOut(phone);
}

async function defaultLogOutbound(rec: OutboundTextRecord): Promise<void> {
  // Lazy so this module stays importable without Firestore (unit tests).
  const { logOutboundText } = await import("./applicant-inbox-firestore");
  await logOutboundText(rec);
}

export async function sendInterviewText(opts: {
  to: string;
  text: string;
  /** Optional reference (e.g. application id) passed along as metadata. */
  ref?: string;
  /** What this text is, for the applicant inbox log (e.g. "interview_start"). */
  kind?: string;
  /** Test hooks. Defaults: global fetch, and a write to applicant_messages. */
  fetchImpl?: typeof fetch;
  logOutbound?: (rec: OutboundTextRecord) => Promise<void>;
  /** Test hook. Default: the sms_opt_outs doc for the number (a STOP reply). */
  isOptedOut?: (phone: string) => Promise<boolean>;
}): Promise<SendTextResult> {
  if (!smsConfigured()) return { skipped: "not configured" };
  const to = normalizePhone(opts.to);
  if (!to) return { skipped: "invalid phone number" };
  // They replied STOP: no applicant texts to this number, ever (until START).
  // A failed lookup doesn't send: better a missed reminder than texting
  // someone who opted out.
  try {
    if (await (opts.isOptedOut ?? defaultIsOptedOut)(to)) return { skipped: "opted out" };
  } catch (e) {
    return { error: `opt-out check failed: ${e instanceof Error ? e.message : String(e)}` };
  }
  let result: SendTextResult;
  try {
    result = await hiBlueSend(
      {
        apiKey: process.env.HIUBLUE_API_KEY!,
        integrationId: process.env.HIUBLUE_INTEGRATION_ID || DEFAULT_INTEGRATION_ID,
        to,
        text: opts.text,
        metadata: { kind: "interview", ...(opts.ref ? { ref: opts.ref } : {}) },
      },
      opts.fetchImpl,
    );
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  if (textWasSent(result)) {
    // Log for the applicant inbox. A failed log never changes the result:
    // the text already went out.
    try {
      await (opts.logOutbound ?? defaultLogOutbound)({
        application_id: opts.ref ?? null,
        phone: to,
        text: opts.text,
        message_id: result.id,
        kind: opts.kind ?? "interview",
      });
    } catch (e) {
      console.error("applicant_messages outbound log failed:", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
