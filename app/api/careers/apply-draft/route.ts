// Draft-save endpoint. Called from the apply form on every field blur
// so partial fills get captured — otherwise a candidate who typed
// their name + email but bailed shows up nowhere. Upserts the same
// Firestore doc identified by the client-generated `draft_id`, always
// with status "pending" while a draft is open. The final submit path
// (/api/careers/apply) transitions the same doc to "completed".

import { normalizePhone } from "@/lib/phone";
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
  has_iphone?: string;
  has_us_bank?: string;
  wants_virality?: string;
  posted_before?: string;
  social_handle?: string;
  /** Job board / link the applicant came from (?src=). */
  source?: string;
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
    const now = FieldValue.serverTimestamp();

    const data: Record<string, unknown> = {
      draft_id: draftId,
      listing_slug: (p.listing_slug ?? "").trim() || null,
      full_name: (p.full_name ?? "").trim() || null,
      email: (p.email ?? "").trim().toLowerCase() || null,
      phone: (p.phone ?? "").trim() || null,
      phone_e164: normalizePhone(p.phone),
      gender: (p.gender ?? "").trim() || null,
      college: (p.college ?? "").trim() || null,
      graduation_year: (p.graduation_year ?? "").trim() || null,
      can_commit: (p.can_commit ?? "").trim() || null,
      comfortable_on_camera: (p.comfortable_on_camera ?? "").trim() || null,
      has_iphone: (p.has_iphone ?? "").trim() || null,
      has_us_bank: (p.has_us_bank ?? "").trim() || null,
      wants_virality: (p.wants_virality ?? "").trim() || null,
      posted_before: (p.posted_before ?? "").trim() || null,
      social_handle: (p.social_handle ?? "").trim() || null,
      ...(p.source ? { source: String(p.source).replace(/[^\w-]/g, "").slice(0, 40) } : {}),
      video_object_path: (p.video_object_path ?? "").trim() || null,
      video_original_name: (p.video_original_name ?? "").trim() || null,
      video_size_bytes: p.video_size_bytes ?? null,
      consent: p.consent === true,
      last_updated_at: now,
    };

    // Read and write in one transaction. The final submit fires at the same
    // moment as the last draft save; a plain get-then-set let the draft land
    // second and knock "awaiting_booking" back to "pending". Once a doc is
    // past "pending" (submitted, booked, decided) a draft save never touches
    // it, and status is only written when the draft is first created.
    const skipped = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (snap.exists) {
        const cur = snap.data() as { status?: string };
        if (cur.status && cur.status !== "pending") return true;
        tx.set(ref, data, { merge: true });
      } else {
        tx.set(ref, {
          ...data,
          status: "pending",
          created_at: now,
          user_agent: req.headers.get("user-agent") ?? null,
          referer: req.headers.get("referer") ?? null,
        });
      }
      return false;
    });
    if (skipped) return NextResponse.json({ ok: true, skipped: "locked" });
    return NextResponse.json({ ok: true, id: draftId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
