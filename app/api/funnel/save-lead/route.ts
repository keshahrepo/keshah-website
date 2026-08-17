// Saves a lead to Firestore at the PhoneNumber step on /startindia.
// Writes a Users doc with firstName + phone_number + nurture_started_at
// keyed by the anonymous Firebase UID. The Cloud Function picks this up
// on its next 10-min cron and starts WhatsApp nurture.
//
// On real signup later, save-profile preserves these fields and adds
// email/providerId/etc. UID stays the same via linkWithCredential, so
// no doc duplication.
//
// Phone format expected: E.164 (e.g., +919999999999) — validated client-side.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface SaveLeadPayload {
  uid: string;
  firstName?: string;
  phoneNumber: string; // E.164
}

function parsePhoneE164(e164: string): {
  complete_number: string;
  country_dial_code: string;
  country_code: string;
  national_number: string;
} | null {
  if (!e164.startsWith("+")) return null;
  // For India (+91), national number is 10 digits.
  // Generic-ish parser: extract dial code (1-3 digits after +), rest is national.
  const cleaned = e164.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+91")) {
    return {
      complete_number: cleaned,
      country_dial_code: "+91",
      country_code: "IN",
      national_number: cleaned.slice(3),
    };
  }
  // Fallback: store full number without breakdown — Cloud Function uses
  // complete_number for sending, so partial structure is OK.
  return {
    complete_number: cleaned,
    country_dial_code: "",
    country_code: "",
    national_number: cleaned.slice(1),
  };
}

export async function POST(req: Request) {
  let payload: SaveLeadPayload;
  try {
    payload = (await req.json()) as SaveLeadPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  if (!payload.uid || !payload.phoneNumber) {
    return NextResponse.json({ ok: false, error: "uid_and_phone_required" }, { status: 400 });
  }

  const phoneFields = parsePhoneE164(payload.phoneNumber);
  if (!phoneFields) {
    return NextResponse.json({ ok: false, error: "invalid_phone_format" }, { status: 400 });
  }

  try {
    const { db } = getFirebaseAdmin();
    const docRef = db.collection("Users").doc(payload.uid);

    // merge:true so we don't blow away anything if this doc already exists
    // (e.g., user navigated back and resubmitted phone).
    await docRef.set(
      {
        // Lead-specific fields
        signup_source: "web_funnel",
        phone_number: phoneFields,
        nurture_started_at: FieldValue.serverTimestamp(),
        userLocalTimeZone: "Asia/Kolkata", // India funnel default
        // Use first_name with snake_case to match what mobile app expects
        // (also keep firstName camelCase for redundancy).
        first_name: payload.firstName ?? "",
        wp_user: {
          ID: payload.uid,
          user_email: "",
          display_name: payload.firstName ?? "",
          purchase_types: [],
        },
        // Mark this doc as a lead (no purchase yet) for Firestore queries.
        lead_status: "active",
        created_at: FieldValue.serverTimestamp(),
        modified_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[funnel/save-lead] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown_error" },
      { status: 500 }
    );
  }
}
