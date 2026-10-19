/**
 * "Remove creator" from the founder app, any stage: offboard (status ended,
 * off the team group, password task if they had account access) and a logged
 * reason. Nothing is sent to them. Kept as a record (pay, contract, taxes), not
 * deleted; it drops off the Creators list (shown under "Show ended").
 */
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { CREATORS_COLLECTION, CreatorDataError } from "./db";
import { logEvent } from "./contract";
import { offboardCreator, type OffboardReason } from "./offboard";

export const REMOVE_REASONS = ["not_interested", "no_onboarding", "not_a_fit", "other"] as const;
export type RemoveReason = (typeof REMOVE_REASONS)[number];

const LABEL: Record<RemoveReason, string> = {
  not_interested: "No longer interested",
  no_onboarding: "Didn't finish onboarding",
  not_a_fit: "Not a fit",
  other: "Other",
};

const OFFBOARD: Record<RemoveReason, OffboardReason> = {
  not_interested: "withdrawn",
  no_onboarding: "setup",
  not_a_fit: "removed",
  other: "removed",
};

export async function removeCreator(id: string, opts: { reason: RemoveReason; note?: string; now?: Date }) {
  if (!(REMOVE_REASONS as readonly string[]).includes(opts.reason)) throw new CreatorDataError("Pick a reason.", 400);
  const now = opts.now ?? new Date();
  const snap = await getFirebaseAdmin().db.collection(CREATORS_COLLECTION).doc(id).get();
  if (!snap.exists) throw new CreatorDataError("Creator not found", 404);
  const off = await offboardCreator(id, OFFBOARD[opts.reason], { now });
  await snap.ref.update({ removed_reason: opts.reason, removed_note: (opts.note ?? "").slice(0, 300), removed_at: now.toISOString() });
  await logEvent(id, { type: "removed", at: now.toISOString(), actor: "admin", detail: `${LABEL[opts.reason]}${opts.note ? `: ${opts.note}` : ""}` }).catch(() => {});
  return { ended_on: off.ended_on, group: off.group, passwords_reset_needed: off.passwords_reset_needed };
}
