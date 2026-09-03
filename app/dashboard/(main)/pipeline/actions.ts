"use server";

// Server actions for the /dashboard/pipeline page. Aadi's UI needs
// two write paths:
//
//   1. Add a new idea to the bank (rare — mostly happens via chat with
//      Claude, but he needs a manual escape hatch for between-session
//      captures).
//   2. Edit an existing idea's title / eli5 / target_metric / status /
//      assigned_version (rare — most edits also happen via me, but he
//      might reprioritize on the fly).
//
// Everything else (moving through kanban stages, marking shipped,
// stamping actual metric deltas) I do from Claude Code via the same
// firebase-admin SDK. No auth layer needed for those writes.
//
// These server actions ARE gated on the admin dashboard's existing
// auth (getFirebaseAdmin only runs on server + the dashboard layout
// requires the admin role to reach the page in the first place). No
// separate auth check needed here.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import type { IdeaStatus } from "@/lib/pipeline/types";

const IDEAS = "Ideas";

/**
 * Create a new idea in the bank. Called from the "+ new idea" button.
 * Minimum fields only; long-form description gets added later.
 */
export async function createIdea(input: {
  title: string;
  eli5: string;
  target_metric: string | null;
  ship_cluster: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const title = input.title.trim();
  if (!title) return { ok: false, error: "Title is required." };

  const { db } = getFirebaseAdmin();

  // Auto-id — Firestore generates. Not p1/p2 style because those are
  // reserved for the migrated legacy proposals.
  const ref = db.collection(IDEAS).doc();
  await ref.set({
    title,
    eli5: input.eli5.trim(),
    description: "",
    status: "bank",
    target_metric: input.target_metric,
    assigned_version: null,
    shipped_at: null,
    actual_delta_pp: null,
    original_proposal_number: null,
    parked_reason: null,
    parked_unpark_trigger: null,
    ship_cluster: input.ship_cluster,
    dependencies: [],
    created_at: FieldValue.serverTimestamp(),
    updated_at: FieldValue.serverTimestamp(),
  });

  revalidatePath("/dashboard/pipeline");
  return { ok: true, id: ref.id };
}

/**
 * Update an existing idea. Only fields you're actually changing need
 * to be present in `updates` — Firestore's set(merge:true) applies
 * partial changes cleanly.
 */
export async function updateIdea(
  id: string,
  updates: Partial<{
    title: string;
    eli5: string;
    description: string;
    status: IdeaStatus;
    target_metric: string | null;
    assigned_version: string | null;
    ship_cluster: string | null;
    dependencies: string[];
    parked_reason: string | null;
    parked_unpark_trigger: string | null;
    actual_delta_pp: number | null;
  }>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!id) return { ok: false, error: "Missing idea id." };

  const { db } = getFirebaseAdmin();
  const ref = db.collection(IDEAS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { ok: false, error: `Idea ${id} not found.` };

  // When status flips to "shipped", stamp shipped_at (idempotent —
  // once set we don't overwrite). When status flips OUT of shipped
  // (rare — mistake correction), clear shipped_at so the timeline
  // doesn't lie.
  const patch: Record<string, unknown> = {
    ...updates,
    updated_at: FieldValue.serverTimestamp(),
  };
  const current = snap.data() ?? {};
  if (updates.status === "shipped" && !current.shipped_at) {
    patch.shipped_at = FieldValue.serverTimestamp();
  }
  if (updates.status && updates.status !== "shipped" && current.shipped_at) {
    patch.shipped_at = null;
  }

  await ref.set(patch, { merge: true });
  revalidatePath("/dashboard/pipeline");
  return { ok: true };
}
