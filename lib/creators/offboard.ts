/**
 * The end of a creator's agreement, done one way whatever ended it:
 *
 *   trial      the founder chose "Don't continue" (lib/creators/trial.ts)
 *   status     an admin set the status to ended (web Creator pay, PATCH)
 *   removed    the dashboard Manage page's "Cut" (DELETE /api/content-creators)
 *   withdrawn  the offer was withdrawn before signing (lib/creators/offer.ts)
 *
 * offboardCreator:
 *   - status "ended", ended_on (kept when already set, else today in their
 *     timezone), offboarded_at + offboard {reason, at, group, ...}
 *   - takes their personal email off their @keshah.com group, so verification
 *     codes for the TikTok / Instagram accounts stop reaching them
 *   - flags a founder task when they had accounts: reset both passwords and
 *     remove any phone number / two-factor (founder Needs you, "Done")
 *   - never touches invoices or posts: the final invoice and bonuses hit within
 *     30 days still come (lib/creators/lifecycle.ts postEndUntil)
 *
 * planReactivate: accepting someone whose creator doc ended (or was cut) gives
 * them a fresh offer on the SAME doc. Sign-in, push tokens, the app's identity
 * lookup and the duplicate-email check all key on the email, so a second doc
 * with the same email would make sign-in pick either one. The old run is kept
 * in previous_runs (and onboarding/state is archived), subcollections stay.
 */
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, CreatorDataError, mapCreatorStatus } from "./db";
import { groupsClientFromEnv, groupsConfigured, provisionCreatorGroup, removeCreatorFromGroup } from "./google-groups";
import { localDateIn } from "./time";

export type OffboardReason = "trial" | "status" | "removed" | "withdrawn" | "setup";

export interface OffboardGroupResult {
  result: "removed" | "not a member" | "skipped" | "error";
  detail?: string;
}

export interface OffboardRecord {
  reason: OffboardReason;
  at: string;
  group: OffboardGroupResult;
  /** They had TikTok / Instagram accounts: the founder resets passwords and removes phone / two-factor. */
  passwords_reset_needed: boolean;
  passwords_reset_at: string | null;
}

const str = (v: unknown) => (typeof v === "string" ? v : "");

function todayIn(tz: string, now: Date): string {
  try {
    return localDateIn(now, tz || "America/New_York");
  } catch {
    return localDateIn(now, "America/New_York");
  }
}

/** Did they get as far as the accounts (so there's something to lock back down)? */
export function hadAccounts(d: DocumentData): boolean {
  return !!(str(d.tiktok_handle).trim() || str(d.instagram_handle).trim());
}

/** Fields offboardCreator writes (pure, for tests). */
export function planOffboard(
  d: DocumentData,
  reason: OffboardReason,
  now: Date,
  opts: { endedOn?: string } = {},
): Record<string, unknown> {
  const at = now.toISOString();
  const endedOn = opts.endedOn || (/^\d{4}-\d{2}-\d{2}$/.test(str(d.ended_on)) ? str(d.ended_on) : todayIn(str(d.timezone), now));
  return {
    ...(d.status !== "ended" ? { status: "ended", status_changed_at: at } : {}),
    ended_on: endedOn,
    offboarded_at: at,
    offboard: {
      reason,
      at,
      group: { result: "skipped" },
      passwords_reset_needed: hadAccounts(d),
      passwords_reset_at: null,
    } satisfies OffboardRecord,
  };
}

/** Ended or offboarded: no access to the account passwords any more. */
export function isOffboarded(d: { status?: unknown; offboarded_at?: unknown; legacy_status?: unknown }): boolean {
  return !!d.offboarded_at || mapCreatorStatus(d.status) === "ended";
}

export async function offboardCreator(
  id: string,
  reason: OffboardReason,
  opts: { now?: Date; endedOn?: string } = {},
): Promise<{ ended_on: string; group: OffboardGroupResult; passwords_reset_needed: boolean }> {
  const now = opts.now ?? new Date();
  const ref = getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const d = snap.data()!;
  // Already offboarded (a second end path, a double tap): nothing more to do.
  if (d.offboarded_at && d.offboard) {
    const o = d.offboard as OffboardRecord;
    if (d.status !== "ended") await ref.update({ status: "ended", status_changed_at: now.toISOString() });
    return { ended_on: String(d.ended_on ?? ""), group: o.group ?? { result: "skipped" }, passwords_reset_needed: !!o.passwords_reset_needed };
  }
  const updates = planOffboard(d, reason, now, opts);
  const record = updates.offboard as OffboardRecord;
  await ref.update(updates);

  const group = String(d.keshah_email ?? "").trim().toLowerCase();
  const personal = String(d.email ?? "").trim().toLowerCase();
  const g: OffboardGroupResult = { result: "skipped" };
  if (!group) g.detail = "No KESHAH email";
  else if (!personal) g.detail = "No personal email to remove";
  else if (!groupsConfigured()) g.detail = "Google Workspace not connected";
  else {
    try {
      const r = await removeCreatorFromGroup(await groupsClientFromEnv(), { groupEmail: group, personalEmail: personal });
      g.result = r.removed ? "removed" : "not a member";
    } catch (e) {
      g.result = "error";
      g.detail = e instanceof Error ? e.message : String(e);
    }
  }
  await ref.update({ "offboard.group": g }).catch((e) => console.error("offboard group record failed:", e));
  return { ended_on: String(updates.ended_on), group: g, passwords_reset_needed: record.passwords_reset_needed };
}

/** Undo of an offboarding (a mis-tapped trial decision): add their personal email back to their group. */
export async function restoreGroupMembership(id: string): Promise<boolean> {
  const snap = await getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id).get();
  const d = snap.data() ?? {};
  const group = String(d.keshah_email ?? "").trim().toLowerCase();
  const personal = String(d.email ?? "").trim().toLowerCase();
  if (!group || !personal || !groupsConfigured()) return false;
  await provisionCreatorGroup(await groupsClientFromEnv(), { fullName: String(d.legal_name || d.name || ""), personalEmail: personal, override: group });
  return true;
}

/** Founder ticked "Done" on "Reset {Name}'s TikTok and Instagram passwords…". */
export async function markPasswordsReset(id: string, now: Date = new Date()): Promise<void> {
  const ref = getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  if (!snap.data()!.offboarded_at) throw new CreatorDataError("They haven't been offboarded.", 409);
  await ref.update({ "offboard.passwords_reset_at": now.toISOString() });
}

/**
 * While they're leaving (still cooperative): take their phone number off the
 * TikTok and Instagram accounts. A linked number can log in with a text code,
 * and removing it can need a code sent to that phone, so it's done before they go.
 */
export function phoneCheckPending(d: DocumentData): boolean {
  return d.status === "leaving" && !d.offboarded_at && !d.phone_removed_at;
}

/** Founder ticked "Done" on "Remove {Name}'s phone number…". */
export async function markPhoneRemoved(id: string, now: Date = new Date()): Promise<void> {
  const ref = getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id);
  if (!(await ref.get()).exists) throw new CreatorDataError("Creator not found", 404);
  await ref.update({ phone_removed_at: now.toISOString() });
}

/** The founder task is still open. */
export function passwordsResetPending(d: DocumentData): boolean {
  const o = (d.offboard ?? null) as Partial<OffboardRecord> | null;
  return !!d.offboarded_at && !!o?.passwords_reset_needed && !o.passwords_reset_at;
}

// ---------------------------------------------------------------- reactivation

/** A doc that a new acceptance should reuse as a fresh offer (rather than "already exists"). */
export function shouldReactivate(d: DocumentData): boolean {
  return d.is_active === false || mapCreatorStatus(d.status) === "ended";
}

const RESET_FIELDS = [
  "ended_on",
  "withdrawn_at",
  "offboarded_at",
  "offboard",
  "trial_plan",
  "trial_outcome",
  "trial_decided_on",
  "trial_completed_on",
  "start_date_source",
  "start_date_set_at",
  "contract_deadline_at",
  "contract_reminder_sent_at",
  "accepted_at",
  "accept",
  "status_auto",
] as const;

/**
 * The fields a fresh offer writes on an ended doc. Clears the old run's dates
 * so accept starts over (new deadline, v2 trial, status onboarding, contract
 * resent, welcome email), and keeps a summary of the old run in previous_runs.
 * Name, legal name, handles, keshah_email, invoices and posts are kept.
 */
export function planReactivate(
  d: DocumentData,
  input: { legal_name?: string; timezone?: string; application_id?: string },
  now: Date,
): Record<string, unknown> {
  const at = now.toISOString();
  const history: Record<string, unknown> = { archived_at: at, status: d.status ?? null, is_active: d.is_active !== false };
  for (const k of ["ended_on", "withdrawn_at", "offboarded_at", "start_date", "trial_outcome", "trial_completed_on", "accepted_at", "application_id"]) {
    if (d[k] !== undefined && d[k] !== null) history[k] = d[k];
  }
  if (d.contract) history.contract = { status: d.contract.status ?? "none", signed_at: d.contract.signed_at ?? null, pdf_path: d.contract.pdf_path ?? null, template_version: d.contract.template_version ?? null };
  const updates: Record<string, unknown> = {
    is_active: true,
    status: "onboarding",
    status_changed_at: at,
    start_date: null,
    start_mode: "first_post",
    contract: { status: "none" },
    reactivated_at: at,
    previous_runs: FieldValue.arrayUnion(history),
    ...(input.application_id ? { application_id: input.application_id } : {}),
    ...(input.timezone && !d.timezone ? { timezone: input.timezone } : {}),
    ...(input.legal_name && !d.legal_name ? { legal_name: input.legal_name } : {}),
  };
  for (const k of RESET_FIELDS) updates[k] = FieldValue.delete();
  return updates;
}

/**
 * Reuse an ended / cut creator doc for a fresh offer. Archives onboarding/state
 * (so Getting started starts over) and returns the doc id.
 */
export async function reactivateCreator(
  id: string,
  input: { legal_name?: string; timezone?: string; application_id?: string },
  now: Date = new Date(),
): Promise<string> {
  const db = getFirebaseAdmin().db;
  const ref = db.collection(CREATORS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const onb = ref.collection("onboarding").doc("state");
  const onbSnap = await onb.get();
  const batch = db.batch();
  if (onbSnap.exists) {
    batch.set(ref.collection("onboarding").doc(`previous_${now.getTime()}`), { ...onbSnap.data(), archived_at: now.toISOString() });
    batch.delete(onb);
  }
  batch.update(ref, planReactivate(snap.data()!, input, now));
  await batch.commit();
  return id;
}
