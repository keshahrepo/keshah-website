/**
 * The founder's call at the end of a v2 trial (20 posting days at 3 videos).
 * Only possible once all 20 days are in; nothing happens automatically.
 *
 *   keep  -> status "active"; the full plan starts the weekday after today
 *   end   -> offboarded (lib/creators/offboard.ts): status "ended", ended_on =
 *            the 20th trial day (paid all $300), off their @keshah.com group
 *   undo  -> back to "waiting for a decision" (a mis-tap)
 *
 * The creator gets a push and an email either way; the app shows the result.
 */
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { notify } from "@/lib/push";
import { CREATORS_COLLECTION, CreatorDataError, isYyyyMmDd, toPostingDay } from "./db";
import { TRIAL_V2_DAY_CENTS, localDate, monthOf, trialWindow } from "./pay";
import { emailConfigured, sendEmail } from "@/lib/email";
import { CREATOR_FROM_NAME } from "./invite";
import { payByForMonth, unpaidTrialCents } from "./lifecycle";
import { trialEndedEmail, trialPassedEmail } from "./notices";
import { offboardCreator, restoreGroupMembership } from "./offboard";
import type { Invoice, YyyyMmDd } from "./types";

export type TrialDecision = "keep" | "end" | "undo";

export async function decideTrial(id: string, decision: TrialDecision, opts: { now?: Date } = {}) {
  const db = getFirebaseAdmin().db;
  const ref = db.collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  if (d.trial_plan !== "v2" || !isYyyyMmDd(d.start_date)) throw new CreatorDataError("This creator isn't on the 20-day trial");
  const days = await ref.collection("posting_days").get();
  const tw = trialWindow({ start_date: d.start_date, trial_plan: "v2" }, days.docs.map((x) => toPostingDay(x.id, x.data())));
  if (!tw?.completedOn) throw new CreatorDataError(`The trial isn't done yet (${tw?.days.length ?? 0} of 20 days)`);
  const now = opts.now ?? new Date();
  const today = localDate(now.toISOString(), d.timezone || "UTC") as YyyyMmDd;
  const at = now.toISOString();

  if (decision === "undo") {
    await ref.update({
      trial_outcome: FieldValue.delete(),
      trial_decided_on: FieldValue.delete(),
      status: "trial",
      status_changed_at: at,
      ...(d.trial_outcome === "end" && d.ended_on === tw.completedOn ? { ended_on: FieldValue.delete() } : {}),
      ...(d.trial_outcome === "end" && d.offboarded_at ? { offboarded_at: FieldValue.delete(), offboard: FieldValue.delete() } : {}),
    });
    // A mis-tapped "Don't continue": put them back on their @keshah.com group.
    if (d.trial_outcome === "end" && d.offboarded_at) await restoreGroupMembership(id).catch((e) => console.error("group restore failed:", e));
    return { outcome: null };
  }
  if (d.trial_outcome) throw new CreatorDataError(`Already decided (${d.trial_outcome}). Undo first to change it.`);

  const email = String(d.email ?? "").trim().toLowerCase();
  const firstName = String(d.name || d.legal_name || "").trim().split(/\s+/)[0] ?? "";
  if (decision === "keep") {
    await ref.update({ trial_outcome: "keep", trial_decided_on: today, status: "active", status_changed_at: at });
    await notify(
      { creatorId: id, email: email || null },
      { title: "You're a KESHAH Creator", body: "You passed your trial. Open the app to see what changes.", data: { type: "trial_decision" } },
    );
    // Push is new to them: the email says what changes, from the first full-plan day.
    const fullPlanFrom = trialWindow(
      { start_date: d.start_date, trial_plan: "v2", trial_outcome: "keep", trial_decided_on: today },
      days.docs.map((x) => toPostingDay(x.id, x.data())),
    )?.promotedOn ?? today;
    const mailed = await mail(email, trialPassedEmail({ firstName, fullPlanFrom }));
    return { outcome: "keep" as const, decided_on: today, email: mailed };
  }
  await ref.update({ trial_outcome: "end", trial_decided_on: today, status_changed_at: at, ended_on: tw.completedOn });
  // The one offboarding path: status ended, off their @keshah.com group, founder password task.
  const off = await offboardCreator(id, "trial", { now, endedOn: tw.completedOn });
  await notify(
    { creatorId: id, email: email || null },
    { title: "Your trial results", body: "Open the app to see the result of your trial.", data: { type: "trial_decision" } },
  );
  const invoices = await ref.collection("invoices").get();
  const finalPayCents = unpaidTrialCents(tw.days.length, TRIAL_V2_DAY_CENTS, invoices.docs.map((x) => x.data() as Invoice));
  const mailed = await mail(email, trialEndedEmail({ firstName, finalPayCents, payBy: payByForMonth(monthOf(tw.completedOn)) }));
  return { outcome: "end" as const, decided_on: today, email: mailed, group: off.group.result };
}

/** Sends a creator email. Never throws; says what happened. */
async function mail(to: string, m: { subject: string; text: string }): Promise<"sent" | "not sent"> {
  if (!to || !emailConfigured()) return "not sent";
  try {
    await sendEmail({ to, subject: m.subject, text: m.text, fromName: CREATOR_FROM_NAME });
    return "sent";
  } catch (e) {
    console.error("trial email failed:", e);
    return "not sent";
  }
}
