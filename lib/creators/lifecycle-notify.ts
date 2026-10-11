/**
 * Sends the lifecycle pushes / emails (copy in ./notices.ts). Every function
 * here never throws: a push or email problem must never undo the founder's
 * action that triggered it. Returns a short note of what went out.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { notify, type PushMessage } from "@/lib/push";
import { notifyFounder } from "@/lib/staff";
import { CREATORS_COLLECTION } from "./db";
import { CREATOR_FROM_NAME } from "./invite";
import {
  bonusDecisionPush,
  dayExcusedPush,
  dayOffDecisionPush,
  disputeResolvedPush,
  founderDayOffPush,
  invoicePaidEmail,
  invoicePaidPush,
  linkReadyPush,
  type Mail,
} from "./notices";
import type { YyyyMmDd } from "./types";

interface Who {
  id: string;
  email: string;
  firstName: string;
  name: string;
}

async function who(id: string): Promise<Who | null> {
  try {
    const snap = await getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    const d = snap.data()!;
    const name = String(d.name || d.legal_name || "").trim();
    return { id, email: String(d.email ?? "").trim().toLowerCase(), firstName: name.split(/\s+/)[0] ?? "", name: name || "A creator" };
  } catch (e) {
    console.error("lifecycle notify lookup failed:", e);
    return null;
  }
}

async function push(w: Who, msg: PushMessage): Promise<string> {
  const r = await notify({ creatorId: w.id, email: w.email || null }, msg);
  return r ? (r.sent > 0 ? "push sent" : "no devices") : "push failed";
}

async function mail(w: Who, m: Mail): Promise<string> {
  if (!w.email) return "no email";
  if (!emailConfigured()) return "email not set up";
  try {
    await sendEmail({ to: w.email, subject: m.subject, text: m.text, fromName: CREATOR_FROM_NAME });
    return "emailed";
  } catch (e) {
    console.error("lifecycle email failed:", e);
    return "email failed";
  }
}

/** "Your October pay is on its way: $650" (push + email). */
export async function notifyInvoicePaid(id: string, inv: { number: string; month: string; total_cents: number }): Promise<string> {
  const w = await who(id);
  if (!w || !inv.total_cents) return "skipped";
  const [p, e] = await Promise.all([
    push(w, invoicePaidPush(inv.month, inv.total_cents, inv.number)),
    mail(w, invoicePaidEmail({ firstName: w.firstName, month: inv.month, cents: inv.total_cents, number: inv.number })),
  ]);
  return `${p}, ${e}`;
}

export async function notifyDisputeResolved(id: string, inv: { number: string; month: string }): Promise<string> {
  const w = await who(id);
  return w ? push(w, disputeResolvedPush(inv.month, inv.number)) : "skipped";
}

export async function notifyBonusDecision(id: string, approved: boolean, platform: string): Promise<string> {
  const w = await who(id);
  return w ? push(w, bonusDecisionPush(approved, platform)) : "skipped";
}

export async function notifyDayOffDecision(id: string, date: YyyyMmDd, status: "approved" | "declined", excused = false): Promise<string> {
  const w = await who(id);
  if (!w) return "skipped";
  return push(w, excused ? dayExcusedPush(date) : dayOffDecisionPush(date, status));
}

/** The creator asked for a day off: tell the founder (the request is also in Needs you). */
export async function notifyFounderDayOff(id: string, date: YyyyMmDd): Promise<void> {
  const w = await who(id);
  if (!w) return;
  await notifyFounder(founderDayOffPush(w.name, date, id));
}

/** Their tracking link was just added while they're setting up: they can finish the link step. */
export async function notifyLinkReady(id: string): Promise<string> {
  const w = await who(id);
  return w ? push(w, linkReadyPush()) : "skipped";
}
