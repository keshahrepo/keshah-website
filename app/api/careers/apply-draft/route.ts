// Draft-save endpoint. Called from the apply form on every field blur
// so partial fills get captured — otherwise a candidate who typed
// their name + email but bailed shows up nowhere. Upserts the same
// Firestore doc identified by the client-generated `draft_id`, always
// with status "pending" while a draft is open. The final submit path
// (/api/careers/apply) transitions the same doc to "completed".

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

type Payload = {
  draft_id?: string;
  listing_slug?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  college?: string;
  graduation_year?: string;
  can_commit?: string;
  comfortable_on_camera?: string;
  wants_virality?: string;
  posted_before?: string;
  social_handle?: string;
  video_object_path?: string;
  video_original_name?: string;
  video_size_bytes?: number;
  consent?: boolean;
};

// A draft with nothing but an id is noise — enforce that at least one
// visible field is non-empty before we bother creating a Firestore doc.
function hasAnyContent(p: Payload): boolean {
  return Boolean(
    (p.full_name && p.full_name.trim()) ||
      (p.email && p.email.trim()) ||
      (p.phone && p.phone.trim()) ||
      (p.gender && p.gender.trim()) ||
      (p.college && p.college.trim()) ||
      (p.graduation_year && p.graduation_year.trim()) ||
      (p.can_commit && p.can_commit.trim()) ||
      (p.social_handle && p.social_handle.trim()) ||
      (p.video_object_path && p.video_object_path.trim())
  );
}

export async function POST(req: Request) {
  try {
    const p = (await req.json()) as Payload;
    const draftId = (p.draft_id ?? "").trim();
    if (!draftId) {
      return NextResponse.json({ error: "Missing draft_id." }, { status: 400 });
    }
    if (!hasAnyContent(p)) {
      // Silent no-op for empty drafts — client can safely fire on
      // every blur without polluting Firestore with blank rows.
      return NextResponse.json({ ok: true, skipped: "empty" });
    }

    const { db } = getFirebaseAdmin();
    const ref = db.collection("careers_applications").doc(draftId);
    const snap = await ref.get();
    const now = FieldValue.serverTimestamp();

    // If the doc already exists and is past "pending" (accepted/denied/
    // completed), do NOT downgrade it back to pending — that would let
    // a stale client tab overwrite an admin decision. Silent skip.
    if (snap.exists) {
      const cur = snap.data() as { status?: string };
      if (cur.status && cur.status !== "pending") {
        return NextResponse.json({ ok: true, skipped: "locked" });
      }
    }

    const data: Record<string, unknown> = {
      draft_id: draftId,
      listing_slug: (p.listing_slug ?? "").trim() || null,
      full_name: (p.full_name ?? "").trim() || null,
      email: (p.email ?? "").trim().toLowerCase() || null,
      phone: (p.phone ?? "").trim() || null,
      gender: (p.gender ?? "").trim() || null,
      college: (p.college ?? "").trim() || null,
      graduation_year: (p.graduation_year ?? "").trim() || null,
      can_commit: (p.can_commit ?? "").trim() || null,
      comfortable_on_camera: (p.comfortable_on_camera ?? "").trim() || null,
      wants_virality: (p.wants_virality ?? "").trim() || null,
      posted_before: (p.posted_before ?? "").trim() || null,
      social_handle: (p.social_handle ?? "").trim() || null,
      video_object_path: (p.video_object_path ?? "").trim() || null,
      video_original_name: (p.video_original_name ?? "").trim() || null,
      video_size_bytes: p.video_size_bytes ?? null,
      consent: p.consent === true,
      status: "pending",
      last_updated_at: now,
    };
    if (!snap.exists) {
      data.created_at = now;
      data.user_agent = req.headers.get("user-agent") ?? null;
      data.referer = req.headers.get("referer") ?? null;
    }

    await ref.set(data, { merge: true });
    return NextResponse.json({ ok: true, id: draftId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
