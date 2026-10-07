/**
 * App onboarding marks for KESHAH Creators. Applicant steps are stored on the
 * careers_applications doc (mobile_* fields); creator steps on
 * ContentCreators/{id}/onboarding/state (mobile_* fields, next to the portal's
 * Getting started state, which keeps unknown fields when it rewrites).
 */
import type { Firestore } from "firebase-admin/firestore";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { APPLICATIONS } from "@/lib/interview";
import type { Identity } from "./identity";

export type MobileStep = "applicant_intro" | "creator_intro" | "pledge" | "plan_seen";

export const STEP_FIELDS: Record<MobileStep, { key: string; field: string; on: "application" | "creator" }> = {
  applicant_intro: { key: "applicant_intro_done_at", field: "mobile_applicant_intro_done_at", on: "application" },
  creator_intro: { key: "creator_intro_done_at", field: "mobile_creator_intro_done_at", on: "creator" },
  pledge: { key: "pledge_at", field: "mobile_pledge_at", on: "creator" },
  plan_seen: { key: "plan_seen_at", field: "mobile_plan_seen_at", on: "creator" },
};

export function isMobileStep(s: unknown): s is MobileStep {
  return typeof s === "string" && Object.prototype.hasOwnProperty.call(STEP_FIELDS, s);
}

function iso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return v;
  const t = v as { toDate?: () => Date };
  return typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

function creatorStateRef(db: Firestore, creatorId: string) {
  return db.collection(CREATORS_COLLECTION).doc(creatorId).collection("onboarding").doc("state");
}

export async function readMobileOnboarding(db: Firestore, id: Identity): Promise<Record<string, string>> {
  const [app, state] = await Promise.all([
    id.application_id ? db.collection(APPLICATIONS).doc(id.application_id).get() : null,
    id.creator_id ? creatorStateRef(db, id.creator_id).get() : null,
  ]);
  const out: Record<string, string> = {};
  for (const { key, field, on } of Object.values(STEP_FIELDS)) {
    const snap = on === "application" ? app : state;
    const v = snap?.exists ? iso(snap.get(field)) : null;
    if (v) out[key] = v;
  }
  return out;
}

/** Records a step the first time (later calls keep the first timestamp). Returns an error message or null. */
export async function markMobileStep(db: Firestore, id: Identity, step: MobileStep, now = new Date()): Promise<string | null> {
  const { field, on } = STEP_FIELDS[step];
  const ref =
    on === "application"
      ? id.application_id
        ? db.collection(APPLICATIONS).doc(id.application_id)
        : null
      : id.creator_id
        ? creatorStateRef(db, id.creator_id)
        : null;
  if (!ref) return on === "application" ? "There's no application on this email." : "This step is for creators.";
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists && snap.get(field)) return;
    tx.set(ref, { [field]: now.toISOString() }, { merge: true });
  });
  return null;
}
