// Careers application submission endpoint. Validates form data, writes
// a document to Firestore `careers_applications`, returns the doc id
// (used by the thank-you page for a canonical reference).
//
// Video upload happened separately via /api/careers/upload-url — this
// endpoint just persists the object path the client got back from that
// signed-URL flow.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { LISTINGS } from "@/app/careers/listings";

type Payload = {
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
      return NextResponse.json(
        { error: "Unknown listing." },
        { status: 400 }
      );
    }

    // Field validation. All server-side because a determined submitter
    // can bypass any HTML `required` attribute — same reason we don't
    // rely on client-side "you must click consent."
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

    // Loose email + gradYear sanity — full validation would need a
    // library; a bad email costs us the ability to reply, not a crash.
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
    const ref = await db.collection("careers_applications").add({
      listing_slug: slug,
      full_name: p.full_name!.trim(),
      email: p.email!.trim().toLowerCase(),
      phone: p.phone!.trim(),
      gender: p.gender!.trim(),
      college: p.college!.trim(),
      graduation_year: p.graduation_year!.trim(),
      can_commit: p.can_commit!.trim(), // "yes" | "no"
      social_handle: (p.social_handle ?? "").trim() || null,
      video_object_path: p.video_object_path!.trim(),
      video_original_name: (p.video_original_name ?? "").trim() || null,
      video_size_bytes: p.video_size_bytes ?? null,
      consent: true,
      status: "new",
      submitted_at: FieldValue.serverTimestamp(),
      // Basic anti-scrape metadata (nothing sensitive).
      user_agent: req.headers.get("user-agent") ?? null,
      referer: req.headers.get("referer") ?? null,
    });

    return NextResponse.json({ ok: true, id: ref.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
