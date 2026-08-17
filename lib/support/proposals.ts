import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "../firebase-admin";

// Proposals are prompt-update suggestions produced by the daily learning cron
// after analysing (draft, sent) edit pairs. Each proposal targets one of the
// three prompt fields, gets reviewed in the dashboard, and applied via
// updatePrompts() when approved.

const PROPOSALS_COLLECTION = "support_learning_proposals";

export type ProposalTarget = "voiceRules" | "canonicalAnswers" | "categoryRules";
export type ProposalStatus = "pending" | "approved" | "rejected";

export type Proposal = {
  id: string;
  target: ProposalTarget;
  summary: string;            // 1-line headline: what's the change
  rationale: string;          // why — references pairs
  patchType: "append" | "replace";
  proposedText: string;       // for "append" this is the new block; for "replace" this is the full new text
  supportingPairIds: string[]; // pointers back to support_learning_pairs
  status: ProposalStatus;
  createdAt: Timestamp;
  resolvedAt: Timestamp | null;
  numPairsAnalyzed: number;
};

export async function writeProposals(rows: Omit<Proposal, "id" | "status" | "createdAt" | "resolvedAt">[]): Promise<void> {
  if (rows.length === 0) return;
  const { db } = getFirebaseAdmin();
  const batch = db.batch();
  const now = Timestamp.now();
  for (const r of rows) {
    const ref = db.collection(PROPOSALS_COLLECTION).doc();
    batch.set(ref, {
      target: r.target,
      summary: r.summary,
      rationale: r.rationale,
      patch_type: r.patchType,
      proposed_text: r.proposedText,
      supporting_pair_ids: r.supportingPairIds,
      num_pairs_analyzed: r.numPairsAnalyzed,
      status: "pending",
      created_at: now,
      resolved_at: null,
    });
  }
  await batch.commit();
}

export async function listProposals(status: ProposalStatus = "pending"): Promise<Proposal[]> {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection(PROPOSALS_COLLECTION)
    .where("status", "==", status)
    .orderBy("created_at", "desc")
    .limit(50)
    .get();
  const out: Proposal[] = [];
  snap.forEach((doc) => {
    const d = doc.data() as Record<string, unknown>;
    out.push({
      id: doc.id,
      target: ((d.target as string) ?? "voiceRules") as ProposalTarget,
      summary: (d.summary as string) ?? "",
      rationale: (d.rationale as string) ?? "",
      patchType: ((d.patch_type as string) ?? "append") as "append" | "replace",
      proposedText: (d.proposed_text as string) ?? "",
      supportingPairIds: ((d.supporting_pair_ids as string[]) ?? []),
      status: ((d.status as string) ?? "pending") as ProposalStatus,
      createdAt: d.created_at as Timestamp,
      resolvedAt: (d.resolved_at as Timestamp | null) ?? null,
      numPairsAnalyzed: (d.num_pairs_analyzed as number) ?? 0,
    });
  });
  return out;
}

export async function setProposalStatus(id: string, status: "approved" | "rejected"): Promise<Proposal | null> {
  const { db } = getFirebaseAdmin();
  const ref = db.collection(PROPOSALS_COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update({ status, resolved_at: Timestamp.now() });
  const d = (await ref.get()).data() as Record<string, unknown>;
  return {
    id,
    target: ((d.target as string) ?? "voiceRules") as ProposalTarget,
    summary: (d.summary as string) ?? "",
    rationale: (d.rationale as string) ?? "",
    patchType: ((d.patch_type as string) ?? "append") as "append" | "replace",
    proposedText: (d.proposed_text as string) ?? "",
    supportingPairIds: ((d.supporting_pair_ids as string[]) ?? []),
    status: ((d.status as string) ?? "pending") as ProposalStatus,
    createdAt: d.created_at as Timestamp,
    resolvedAt: (d.resolved_at as Timestamp | null) ?? null,
    numPairsAnalyzed: (d.num_pairs_analyzed as number) ?? 0,
  };
}
