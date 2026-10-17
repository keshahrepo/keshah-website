/**
 * The 3-day setup deadline, applied (Firestore, email, push). Rules and copy
 * live in lib/creators/setup-deadline.ts.
 *
 *   sendGetStartedEmails  cron (with the contract reminders): offer open 24h, app never opened
 *   setSetupDue           founder: "Change" the setup due date (any time during setup, even before signing)
 *   extendSetup           founder: "Give 3 more days"
 *   endSetup              founder: "End agreement" (offboard + short email)
 */
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { notify } from "@/lib/push";
import { claimOnce } from "@/lib/interview";
import { CREATORS_COLLECTION, CreatorDataError, getOnboarding, onboardingSteps } from "./db";
import { logEvent } from "./contract";
import { CREATOR_FROM_NAME, CREATOR_SIGNOFF, creatorAppUrl, lightEmailHtml } from "./invite";
import { offboardCreator } from "./offboard";
import { deadlineOf, firstNameOf } from "./deadline";
import { localDateIn } from "./time";
import { SETUP_EXTEND_DAYS, getStartedDue, getStartedEmail, setupInputFromDoc, setupState, type GetStartedDoc } from "./setup-deadline";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const ref = (id: string) => getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);

// ---------------------------------------------------------------- Get started (cron)

export async function sendGetStartedEmails(now: Date = new Date(), opts: { dry?: boolean } = {}): Promise<{ id: string; name: string; result?: string }[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection(CREATORS_COLLECTION).where("status", "==", "onboarding").get();
  const report: { id: string; name: string; result?: string }[] = [];
  for (const doc of snap.docs) {
    const d = doc.data() as GetStartedDoc & Record<string, unknown>;
    if (!getStartedDue(d, now)) continue;
    const row: { id: string; name: string; result?: string } = { id: doc.id, name: String(d.name || d.legal_name || "") };
    report.push(row);
    if (opts.dry) continue;
    const email = String(d.email ?? "").trim().toLowerCase();
    if (!email || !emailConfigured()) {
      row.result = email ? "email not configured" : "no email";
      continue;
    }
    const at = now.toISOString();
    const won = await claimOnce(db, doc.ref, (cur) => (getStartedDue(cur as GetStartedDoc, now) ? { get_started_sent_at: at } : null));
    if (!won) {
      row.result = "already sent";
      continue;
    }
    try {
      const m = getStartedEmail({ firstName: firstNameOf(d), appUrl: creatorAppUrl(), signInEmail: email, deadlineIso: deadlineOf(d)! });
      await sendEmail({ to: email, subject: m.subject, text: m.text, html: m.html, fromName: CREATOR_FROM_NAME });
      row.result = "sent";
      await logEvent(doc.id, { type: "get_started_sent", at, actor: "system", detail: "Get started email (24h, app not opened)" }).catch(() => {});
    } catch (e) {
      // Free the claim so the next run retries.
      await doc.ref.update({ get_started_sent_at: null }).catch(() => {});
      row.result = `failed (${errMsg(e)}), will retry`;
    }
  }
  return report;
}

// ---------------------------------------------------------------- founder actions

async function loadSetup(id: string, now: Date) {
  const snap = await ref(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  const onb = await getOnboarding(id);
  const st = setupState(setupInputFromDoc(d, onb, onboardingSteps(onb, { contractSigned: d.contract?.status === "signed" })), now);
  return { d, st };
}

/** "Change": sets the setup due date (yyyy-mm-dd, their timezone). Replaces any "Give 3 more days". No message. */
export async function setSetupDue(id: string, dueDate: string, now: Date = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) throw new CreatorDataError("Pick a date.");
  const { d, st } = await loadSetup(id, now);
  if (d.status !== "onboarding" || d.withdrawn_at) throw new CreatorDataError("They're not in onboarding.", 409);
  if (st.done) throw new CreatorDataError("They've already finished onboarding.", 409);
  const today = localDateIn(now, typeof d.timezone === "string" ? d.timezone : "UTC");
  if (dueDate < today) throw new CreatorDataError("Pick today or a later date.");
  await ref(id).update({ setup_due_override: dueDate, setup_extra_days: 0, setup_due_set_at: now.toISOString() });
  const after = await loadSetup(id, now);
  await logEvent(id, { type: "setup_extended", at: now.toISOString(), actor: "admin", detail: `Setup due set to ${dueDate}` }).catch(() => {});
  return { setup: after.st };
}

/** "Give 3 more days": moves the setup due date (no message to the creator). */
export async function extendSetup(id: string, now: Date = new Date()) {
  const { d, st } = await loadSetup(id, now);
  if (d.status !== "onboarding") throw new CreatorDataError("They're past onboarding.", 409);
  if (st.done) throw new CreatorDataError("They've already finished onboarding.", 409);
  await ref(id).update({ setup_extra_days: FieldValue.increment(SETUP_EXTEND_DAYS), setup_extended_at: now.toISOString() });
  const after = await loadSetup(id, now);
  await logEvent(id, { type: "setup_extended", at: now.toISOString(), actor: "admin", detail: `Setup due ${after.st.due_date}` }).catch(() => {});
  return { setup: after.st };
}

export function setupEndedEmail(firstName: string): { subject: string; text: string; html: string } {
  const paras = [
    { text: `Hi ${firstName || "there"},` },
    { text: "Since your onboarding in the KESHAH Creators app wasn't finished, we've ended your creator contract." },
    { text: "Thank you for your time and your interest in KESHAH. We wish you all the best." },
  ];
  const text = [...paras.flatMap((x) => [x.text, ""]), CREATOR_SIGNOFF].join("\n");
  return { subject: "Your KESHAH creator contract", text, html: lightEmailHtml(paras) };
}

/** "End agreement" for a creator who didn't finish setup: offboard + a short email + push. */
export async function endSetup(id: string, now: Date = new Date()) {
  const { d, st } = await loadSetup(id, now);
  if (d.status !== "onboarding") throw new CreatorDataError("They're past onboarding, so end it from their page instead.", 409);
  if (st.done) throw new CreatorDataError("They've already finished onboarding.", 409);
  const off = await offboardCreator(id, "setup", { now });
  const email = String(d.email ?? "").trim().toLowerCase();
  let mailed = false;
  if (email && emailConfigured()) {
    try {
      const m = setupEndedEmail(firstNameOf(d));
      await sendEmail({ to: email, subject: m.subject, text: m.text, html: m.html, fromName: CREATOR_FROM_NAME });
      mailed = true;
    } catch (e) {
      console.error("setup ended email failed:", errMsg(e));
    }
  }
  await notify({ creatorId: id, email: email || null }, { title: "Your KESHAH contract", body: "Open the app for an update on your contract.", data: { type: "agreement" } }).catch(() => null);
  await logEvent(id, { type: "setup_ended", at: now.toISOString(), actor: "admin", detail: `Setup not finished (${st.steps_left} steps left); email ${mailed ? "sent" : "not sent"}` }).catch(() => {});
  return { ended_on: off.ended_on, group: off.group, passwords_reset_needed: off.passwords_reset_needed, email: mailed };
}
