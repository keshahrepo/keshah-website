// Final submit endpoint. Client sends the same draft_id it's been
// upserting to via /api/careers/apply-draft, plus the final field
// values + video path. Server validates and transitions the doc from
// "pending" to "completed" — same Firestore doc, no duplicates.
//
// If the client sends no draft_id (e.g. a script bypassing the form),
// we create a fresh doc so the submission still lands somewhere.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { LISTINGS } from "@/app/careers/listings";

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
  social_handle?: string;
  video_object_path?: string;
  video_original_name?: string;
  video_size_bytes?: number;
  consent?: boolean;
};

function required(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function POST(req: Request) {
  try {
    const p = (await req.json()) as Payload;

    const slug = (p.listing_slug ?? "").trim();
    if (!LISTINGS.some((l) => l.slug === slug)) {
      return NextResponse.json({ error: "Unknown listing." }, { status: 400 });
    }

    const missing: string[] = [];
    if (!required(p.full_name)) missing.push("full_name");
    if (!required(p.email)) missing.push("email");
    if (!required(p.phone)) missing.push("phone");
    if (!required(p.gender)) missing.push("gender");
    if (!required(p.college)) missing.push("college");
    if (!required(p.graduation_year)) missing.push("graduation_year");
    if (!required(p.can_commit)) missing.push("can_commit");
    if (!required(p.video_object_path)) missing.push("video_object_path");
    if (p.consent !== true) missing.push("consent");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: "Missing required fields.", fields: missing },
        { status: 400 }
      );
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email!)) {
      return NextResponse.json({ error: "Invalid email." }, { status: 400 });
    }
    if (!/^20\d{2}$/.test(p.graduation_year!)) {
      return NextResponse.json(
        { error: "Invalid graduation year." },
        { status: 400 }
      );
    }

    const { db } = getFirebaseAdmin();
    const now = FieldValue.serverTimestamp();
    const data = {
      listing_slug: slug,
      full_name: p.full_name!.trim(),
      email: p.email!.trim().toLowerCase(),
      phone: p.phone!.trim(),
      gender: p.gender!.trim(),
      college: p.college!.trim(),
      graduation_year: p.graduation_year!.trim(),
      can_commit: p.can_commit!.trim(),
      social_handle: (p.social_handle ?? "").trim() || null,
      video_object_path: p.video_object_path!.trim(),
      video_original_name: (p.video_original_name ?? "").trim() || null,
      video_size_bytes: p.video_size_bytes ?? null,
      consent: true,
      status: "completed",
      submitted_at: now,
      last_updated_at: now,
      user_agent: req.headers.get("user-agent") ?? null,
      referer: req.headers.get("referer") ?? null,
    };

    let id: string;
    const draftId = (p.draft_id ?? "").trim();
    if (draftId) {
      // Merge into the existing draft doc; never downgrade a decided
      // one back to "completed".
      const ref = db.collection("careers_applications").doc(draftId);
      const snap = await ref.get();
      if (snap.exists) {
        const cur = snap.data() as { status?: string };
        if (cur.status === "accepted" || cur.status === "denied") {
          return NextResponse.json({ ok: true, id: draftId });
        }
      }
      await ref.set(data, { merge: true });
      id = draftId;
    } else {
      const ref = await db.collection("careers_applications").add(data);
      id = ref.id;
    }

    return NextResponse.json({ ok: true, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
