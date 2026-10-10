// Background support drafts: the cron (app/api/cron/support-drafts) drafts a
// reply for every conversation waiting on Aadi, so opening a chat in the
// founder app shows the draft instantly instead of waiting on the model.
//
// A draft "covers" the latest user message when its for_message_ms (the
// last_message timestamp it was generated against) is >= that message's
// time. Older drafts without for_message_ms fall back to generated_at.
//
// Overlapping runs are safe: each conversation is claimed in a transaction
// (support/{userId}.draft_claim) that re-checks it still needs a draft. A
// claim expires after CLAIM_TTL_MS; a failed generation leaves its claim in
// place, which doubles as a back-off so one broken conversation can't eat
// every run's budget.

import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "../firebase-admin";
import type { DraftCategory } from "./repo";
import { draftRecordOf } from "./repo";

const AADI_FROM_ID = "0";
const SUPPORT_COLLECTION = "support";

export const DRAFTS_PER_RUN = 10;
export const CLAIM_TTL_MS = 10 * 60_000;

type Millis = { toMillis(): number };

/** The fields selection needs; AwaitingConversation satisfies it. */
export type DraftCandidate = {
  userId: string;
  lastMessage: { fromId: string; timestamp: Millis | null };
  lastUpdateAt: Millis | null;
  draft: { generated_at: Millis; for_message_ms?: number | null } | null;
  skipUntil?: Millis | null;
  draftClaim?: { at: Millis; for_message_ms?: number | null } | null;
};

export function latestMessageMs(c: Pick<DraftCandidate, "lastMessage" | "lastUpdateAt">): number | null {
  return c.lastMessage.timestamp?.toMillis() ?? c.lastUpdateAt?.toMillis() ?? null;
}

export function draftCoversLatest(draft: DraftCandidate["draft"], latestMs: number | null): boolean {
  if (!draft) return false;
  if (latestMs === null) return true; // no timestamp to compare against: any draft will do
  if (typeof draft.for_message_ms === "number") return draft.for_message_ms >= latestMs;
  return (draft.generated_at?.toMillis?.() ?? 0) >= latestMs;
}

export function claimActive(claim: DraftCandidate["draftClaim"], nowMs: number): boolean {
  return !!claim?.at && nowMs - claim.at.toMillis() < CLAIM_TTL_MS;
}

/** Waiting on Aadi, not snoozed, no draft for the latest message, nobody drafting it right now. */
export function needsDraft(c: DraftCandidate, nowMs: number): boolean {
  if (!c.lastMessage?.fromId || c.lastMessage.fromId === AADI_FROM_ID) return false;
  if (c.skipUntil && c.skipUntil.toMillis() > nowMs) return false;
  if (draftCoversLatest(c.draft, latestMessageMs(c))) return false;
  if (claimActive(c.draftClaim, nowMs)) return false;
  return true;
}

/** Conversations to draft this run: oldest waiting first, at most `cap`. */
export function selectConversationsToDraft<T extends DraftCandidate>(convos: T[], nowMs: number, cap = DRAFTS_PER_RUN): T[] {
  return convos
    .filter((c) => needsDraft(c, nowMs))
    .sort((a, b) => (latestMessageMs(a) ?? Number.MAX_SAFE_INTEGER) - (latestMessageMs(b) ?? Number.MAX_SAFE_INTEGER))
    .slice(0, cap);
}

/** Raw support/{userId} doc -> DraftCandidate. */
export function candidateFromDoc(userId: string, data: Record<string, unknown>): DraftCandidate | null {
  const lm = (data.last_message ?? null) as Record<string, unknown> | null;
  if (!lm || typeof lm.fromId !== "string") return null;
  return {
    userId,
    lastMessage: { fromId: lm.fromId, timestamp: (lm.timestamp ?? null) as Millis | null },
    lastUpdateAt: (data.last_update_at ?? null) as Millis | null,
    draft: (data.last_draft ?? null) as DraftCandidate["draft"],
    skipUntil: (data.skip_until ?? null) as Millis | null,
    draftClaim: (data.draft_claim ?? null) as DraftCandidate["draftClaim"],
  };
}

/**
 * Claims a conversation for drafting. Returns the latest message time the
 * draft will answer, or false when it no longer needs one (someone else
 * claimed it, Aadi replied, a draft landed meanwhile).
 */
export async function claimForDraft(userId: string, nowMs = Date.now()): Promise<{ forMessageMs: number | null } | false> {
  const { db } = getFirebaseAdmin();
  const ref = db.collection(SUPPORT_COLLECTION).doc(userId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? candidateFromDoc(userId, snap.data() as Record<string, unknown>) : null;
    if (!c || !needsDraft(c, nowMs)) return false;
    const forMessageMs = latestMessageMs(c);
    tx.update(ref, { draft_claim: { at: Timestamp.fromMillis(nowMs), for_message_ms: forMessageMs } });
    return { forMessageMs };
  });
}

/**
 * Stores a background draft and frees the claim. Doesn't overwrite when Aadi
 * already replied or a draft for the same/newer message is already there
 * (e.g. he tapped regenerate while this one was generating).
 */
export async function saveBackgroundDraft(
  userId: string,
  draft: { content: string; category: DraftCategory; model: string; promptVersion?: number },
  forMessageMs: number | null,
): Promise<boolean> {
  const { db } = getFirebaseAdmin();
  const ref = db.collection(SUPPORT_COLLECTION).doc(userId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const c = snap.exists ? candidateFromDoc(userId, snap.data() as Record<string, unknown>) : null;
    const stillWaiting = !!c && c.lastMessage.fromId !== AADI_FROM_ID;
    const existing = c?.draft ?? null;
    const alreadyCovered = forMessageMs !== null && draftCoversLatest(existing, forMessageMs);
    if (!stillWaiting || alreadyCovered) {
      if (snap.exists) tx.update(ref, { draft_claim: FieldValue.delete() });
      return false;
    }
    tx.update(ref, { last_draft: draftRecordOf(draft, forMessageMs), draft_claim: FieldValue.delete() });
    return true;
  });
}
