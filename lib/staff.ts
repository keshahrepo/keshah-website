/**
 * Founder access from the KESHAH Creators app: a normal mobile session token
 * whose email is on the staff list counts as an admin dashboard session.
 *
 * Staff list: Settings/mobile_staff { emails: [...] } (cached for a minute),
 * plus FOUNDER_EMAILS (comma-separated) as a fallback. Checked on every call,
 * so removing an email takes effect within a minute even though mobile
 * tokens last 180 days.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { bearerToken, verifyMobileToken } from "@/lib/mobile/token";

let cache: { at: number; emails: Set<string> } | null = null;
const TTL_MS = 60_000;

const norm = (e: string) => e.trim().toLowerCase();

export async function staffEmails(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.emails;
  const out = new Set<string>((process.env.FOUNDER_EMAILS ?? "").split(",").map(norm).filter(Boolean));
  try {
    const snap = await getFirebaseAdmin().db.collection("Settings").doc("mobile_staff").get();
    const list = snap.exists ? snap.data()?.emails : null;
    if (Array.isArray(list)) for (const e of list) if (typeof e === "string" && e.trim()) out.add(norm(e));
  } catch (e) {
    console.error("staff list read failed:", e);
  }
  cache = { at: Date.now(), emails: out };
  return out;
}

export async function isStaffEmail(email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return (await staffEmails()).has(norm(email));
}

/** The staff email behind a mobile bearer token, or null. */
export async function founderFromHeaders(headers: Headers): Promise<string | null> {
  const token = bearerToken(headers);
  if (!token) return null;
  const claims = await verifyMobileToken(token);
  if (!claims) return null;
  return (await isStaffEmail(claims.sub)) ? claims.sub : null;
}

/** Push to every staff device (the founder app). Never throws. */
export async function notifyFounder(msg: { title: string; body: string; data?: Record<string, string> }): Promise<void> {
  try {
    const { notify } = await import("@/lib/push");
    const emails = [...(await staffEmails())];
    await Promise.all(emails.map((email) => notify({ email }, { ...msg, data: { audience: "founder", ...(msg.data ?? {}) } })));
  } catch (e) {
    console.error("founder push failed:", e);
  }
}
