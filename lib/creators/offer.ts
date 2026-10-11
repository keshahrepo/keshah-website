/**
 * The 72-hour contract deadline, applied (Firestore, email, push, Google).
 * Pure rules and copy live in lib/creators/deadline.ts.
 *
 *   sendContractReminders  cron: push + email once, in the last 30 hours before the deadline
 *   extendOffer            founder: "Give 48 more hours" (sends nothing)
 *   withdrawOffer          founder: "Withdraw offer" (status ended, short email, off the inbox group)
 *
 * Each action is logged in the creator's contract_events.
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { notify } from "@/lib/push";
import { claimOnce } from "@/lib/interview";
import { CREATORS_COLLECTION, CreatorDataError } from "./db";
import { logEvent } from "./contract";
import { CREATOR_FROM_NAME } from "./invite";
import { groupsClientFromEnv, groupsConfigured, removeCreatorFromGroup } from "./google-groups";
import {
  OfferError,
  deadlineLong,
  deadlineOf,
  firstNameOf,
  planExtend,
  planWithdraw,
  reminderDue,
  reminderEmail,
  reminderPush,
  type OfferDoc,
} from "./deadline";

function ref(id: string) {
  return getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);
}

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function load(id: string): Promise<OfferDoc & Record<string, unknown>> {
  const snap = await ref(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  return snap.data()!;
}

function asDataError(e: unknown): never {
  if (e instanceof OfferError) throw new CreatorDataError(e.message, e.status);
  throw e;
}

// ---------------------------------------------------------------- reminder (cron)

export interface ReminderRow {
  id: string;
  name: string;
  deadline: string;
  result?: string;
}

export async function sendContractReminders(now: Date = new Date(), opts: { dry?: boolean } = {}): Promise<{ checked: number; report: ReminderRow[] }> {
  const { db } = getFirebaseAdmin();
  // New offers are status "onboarding" until signed; the rest is filtered in reminderDue.
  const snap = await db.collection(CREATORS_COLLECTION).where("status", "==", "onboarding").get();
  const report: ReminderRow[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as OfferDoc;
    if (!reminderDue(d, now)) continue;
    const deadline = deadlineOf(d)!;
    const row: ReminderRow = { id: doc.id, name: String(d.name || d.legal_name || ""), deadline };
    report.push(row);
    if (opts.dry) continue;
    // Claim first (idempotent across overlapping runs); re-checks the doc inside the transaction.
    const at = now.toISOString();
    const won = await claimOnce(db, doc.ref, (cur) => (reminderDue(cur as OfferDoc, now) ? { contract_reminder_sent_at: at } : null));
    if (!won) {
      row.result = "already sent";
      continue;
    }
    const email = String(d.email ?? "").trim().toLowerCase();
    const push = await notify({ creatorId: doc.id, email: email || null }, reminderPush(deadline, now));
    let mailed = false;
    let mailErr = "";
    let mailThrew = false;
    if (email && emailConfigured()) {
      try {
        const m = reminderEmail({ firstName: firstNameOf(d), deadlineIso: deadline });
        await sendEmail({ to: email, subject: m.subject, text: m.text, fromName: CREATOR_FROM_NAME });
        mailed = true;
      } catch (e) {
        mailErr = errMsg(e);
        mailThrew = true;
      }
    } else {
      mailErr = email ? "email not configured" : "no email";
    }
    const pushed = (push?.sent ?? 0) > 0;
    row.result = `push ${pushed ? "sent" : push ? "no devices" : "failed"}, email ${mailed ? "sent" : `not sent (${mailErr})`}`;
    // Nothing reached them because something failed (not just "no devices"): free the claim so the next run retries.
    if (!pushed && !mailed && (push === null || mailThrew)) {
      await doc.ref.update({ contract_reminder_sent_at: null }).catch(() => {});
      row.result += " (will retry)";
      continue;
    }
    await logEvent(doc.id, { type: "reminder_sent", at, actor: "system", detail: `${row.result}; deadline ${deadline}` }).catch(() => {});
  }
  return { checked: snap.size, report };
}

// ---------------------------------------------------------------- extend

export async function extendOffer(id: string, now: Date = new Date()): Promise<{ contract_deadline_at: string; label: string }> {
  const r = ref(id);
  const db = getFirebaseAdmin().db;
  const res = await db.runTransaction(async (tx) => {
    const snap = await tx.get(r);
    if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
    let plan: ReturnType<typeof planExtend>;
    try {
      plan = planExtend(snap.data() as OfferDoc, now);
    } catch (e) {
      asDataError(e);
    }
    tx.update(r, plan.updates);
    return { from: deadlineOf(snap.data() as OfferDoc)!, to: plan.deadline };
  });
  await logEvent(id, { type: "deadline_extended", at: now.toISOString(), actor: "admin", detail: `${res.from} -> ${res.to}` }).catch(() => {});
  return { contract_deadline_at: res.to, label: deadlineLong(res.to) };
}

// ---------------------------------------------------------------- withdraw

/** What "Withdraw offer" will send, for the confirm sheet. */
export async function withdrawPreview(id: string, now: Date = new Date()): Promise<{ to: string | null; subject: string; text: string; group: string | null }> {
  const d = await load(id);
  let plan: ReturnType<typeof planWithdraw>;
  try {
    plan = planWithdraw(d, now, String(d.timezone ?? ""));
  } catch (e) {
    asDataError(e);
  }
  const fallback = plan.email ?? { to: null, subject: "", text: "" };
  return { to: plan.email?.to ?? null, subject: fallback.subject, text: fallback.text, group: plan.groupEmail };
}

export interface WithdrawResult {
  withdrawn_at: string;
  email: "sent" | "not sent";
  email_detail?: string;
  group: "removed" | "not a member" | "skipped" | "error";
  group_detail?: string;
}

export async function withdrawOffer(id: string, now: Date = new Date()): Promise<WithdrawResult> {
  const r = ref(id);
  const db = getFirebaseAdmin().db;
  // Status first (in a transaction), so a double tap can't send two emails.
  const { plan, d } = await db.runTransaction(async (tx) => {
    const snap = await tx.get(r);
    if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
    const data = snap.data()!;
    let p: ReturnType<typeof planWithdraw>;
    try {
      p = planWithdraw(data as OfferDoc, now, String(data.timezone ?? ""));
    } catch (e) {
      asDataError(e);
    }
    tx.update(r, p.updates);
    return { plan: p, d: data };
  });
  const at = now.toISOString();
  const out: WithdrawResult = { withdrawn_at: at, email: "not sent", group: "skipped" };

  if (!plan.email) out.email_detail = "No personal email on file";
  else if (!emailConfigured()) out.email_detail = "Email isn't set up on the server";
  else {
    try {
      await sendEmail({ to: plan.email.to, subject: plan.email.subject, text: plan.email.text, fromName: CREATOR_FROM_NAME });
      out.email = "sent";
    } catch (e) {
      out.email_detail = errMsg(e);
    }
  }

  const personal = String(d.email ?? "").trim();
  if (!plan.groupEmail) out.group_detail = "No KESHAH email";
  else if (!personal) out.group_detail = "No personal email to remove";
  else if (!groupsConfigured()) out.group_detail = "Google Workspace not connected";
  else {
    try {
      const g = await removeCreatorFromGroup(await groupsClientFromEnv(), { groupEmail: plan.groupEmail, personalEmail: personal });
      out.group = g.removed ? "removed" : "not a member";
    } catch (e) {
      out.group = "error";
      out.group_detail = errMsg(e);
    }
  }

  const detail = [
    `email ${out.email}${out.email_detail ? ` (${out.email_detail})` : ""}`,
    `group ${plan.groupEmail ?? "-"}: ${out.group}${out.group_detail ? ` (${out.group_detail})` : ""}`,
  ].join("; ");
  await logEvent(id, { type: "offer_withdrawn", at, actor: "admin", detail }).catch(() => {});
  return out;
}
