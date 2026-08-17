import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "../firebase-admin";

// Stored signal: every time Aadi hits Send on a draft we record
// (draft, sent, prompt_version, similarity, editType). The daily learning
// cron reads from this collection to propose prompt updates.

const PAIRS_COLLECTION = "support_learning_pairs";

export type EditType = "verbatim" | "minor" | "rewrite" | "no_draft";

export type LearningPair = {
  id?: string;
  userId: string;
  draft: string | null;          // null when there was no draft (Aadi typed from scratch)
  sent: string;
  editType: EditType;
  similarity: number;            // 0..1
  promptVersion: number | null;  // prompt version the draft was generated with
  category: string | null;       // draft's classification (answerable / investigation / etc.)
  sentAt: Timestamp;
};

// Lightweight similarity for short messages: normalize whitespace + case, then
// compute Jaccard over word-sets and Levenshtein-derived ratio over chars,
// take the average. Good enough to bucket verbatim/minor/rewrite without
// pulling in a dep. Returns [0,1].
export function similarity(a: string, b: string): number {
  const normA = a.trim().toLowerCase().replace(/\s+/g, " ");
  const normB = b.trim().toLowerCase().replace(/\s+/g, " ");
  if (!normA && !normB) return 1;
  if (!normA || !normB) return 0;
  if (normA === normB) return 1;

  // Word-set Jaccard
  const wordsA = new Set(normA.split(" "));
  const wordsB = new Set(normB.split(" "));
  const intersect = new Set([...wordsA].filter((w) => wordsB.has(w)));
  const unionSize = wordsA.size + wordsB.size - intersect.size;
  const jaccard = unionSize === 0 ? 1 : intersect.size / unionSize;

  // Char-level ratio: 1 - (edit distance / max length). Use a cheap LCS-based
  // approximation; we don't need true Levenshtein for bucketing.
  const lenA = normA.length;
  const lenB = normB.length;
  const maxLen = Math.max(lenA, lenB);
  const lcsLen = longestCommonSubsequenceLength(normA, normB);
  const charRatio = maxLen === 0 ? 1 : lcsLen / maxLen;

  return (jaccard + charRatio) / 2;
}

// O(n*m) LCS, capped at first 800 chars to keep cron-time bounded.
function longestCommonSubsequenceLength(a: string, b: string): number {
  const sa = a.slice(0, 800);
  const sb = b.slice(0, 800);
  const m = sa.length;
  const n = sb.length;
  if (m === 0 || n === 0) return 0;
  let prev = new Array(n + 1).fill(0);
  let curr = new Array(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (sa[i - 1] === sb[j - 1]) curr[j] = prev[j - 1] + 1;
      else curr[j] = Math.max(prev[j], curr[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

export function classifyEdit(sim: number, hadDraft: boolean): EditType {
  if (!hadDraft) return "no_draft";
  if (sim >= 0.95) return "verbatim";
  if (sim >= 0.7) return "minor";
  return "rewrite";
}

// Snapshot one (draft, sent) pair. Safe to call from /api/support/send.
// Failures here must NOT bubble up: the user-facing Send action has to
// succeed even if the learning sidecar throws.
export async function recordLearningPair(opts: {
  userId: string;
  draft: string | null;
  sent: string;
  promptVersion: number | null;
  category: string | null;
}): Promise<void> {
  try {
    const { db } = getFirebaseAdmin();
    const sim = opts.draft ? similarity(opts.draft, opts.sent) : 0;
    const editType = classifyEdit(sim, opts.draft !== null);
    await db.collection(PAIRS_COLLECTION).add({
      user_id: opts.userId,
      draft: opts.draft,
      sent: opts.sent,
      edit_type: editType,
      similarity: sim,
      prompt_version: opts.promptVersion,
      category: opts.category,
      sent_at: Timestamp.now(),
    });
  } catch (e) {
    console.error("[recordLearningPair] failed", e instanceof Error ? e.message : e);
  }
}

// Read pairs sent within the last N hours. Used by the daily learning cron.
export async function recentLearningPairs(opts: { hours: number; minSimilarity?: number; maxSimilarity?: number }): Promise<LearningPair[]> {
  const { db } = getFirebaseAdmin();
  const since = Timestamp.fromMillis(Date.now() - opts.hours * 3600_000);
  const snap = await db
    .collection(PAIRS_COLLECTION)
    .where("sent_at", ">=", since)
    .orderBy("sent_at", "desc")
    .get();
  const out: LearningPair[] = [];
  snap.forEach((doc) => {
    const d = doc.data() as Record<string, unknown>;
    const sim = (d.similarity as number) ?? 0;
    if (opts.minSimilarity !== undefined && sim < opts.minSimilarity) return;
    if (opts.maxSimilarity !== undefined && sim > opts.maxSimilarity) return;
    out.push({
      id: doc.id,
      userId: (d.user_id as string) ?? "",
      draft: (d.draft as string | null) ?? null,
      sent: (d.sent as string) ?? "",
      editType: ((d.edit_type as string) ?? "no_draft") as EditType,
      similarity: sim,
      promptVersion: (d.prompt_version as number | null) ?? null,
      category: (d.category as string | null) ?? null,
      sentAt: d.sent_at as Timestamp,
    });
  });
  return out;
}
