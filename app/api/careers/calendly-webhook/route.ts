// Calendly webhook — transitions application status from
// "awaiting_booking" → "booked" when the applicant confirms a slot.
//
// Setup (one-time, outside the codebase):
//   1. In Calendly: Integrations → API & Webhooks → create a webhook
//      pointing at https://www.keshah.com/api/careers/calendly-webhook
//   2. Subscribe to the "invitee.created" event (and optionally
//      "invitee.canceled" if we later want to flip booked → canceled)
//   3. Copy the signing secret Calendly gives you into Vercel env as
//      CALENDLY_WEBHOOK_SIGNING_KEY — the endpoint verifies the
//      Calendly-Webhook-Signature header against this. If the env var
//      is unset, verification is skipped (dev / first-run convenience).
//
// Matching to the applicant doc uses the tracking.utm_source field,
// which the apply page sets to the Firestore draft_id when it builds
// the Calendly URL. Falls back to invitee email if utm_source is empty
// (e.g. someone navigated to the raw Calendly link, not through our
// apply flow — then we still want to capture them if the email
// matches an existing application).

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const maxDuration = 15;

const SIGNING_KEY = process.env.CALENDLY_WEBHOOK_SIGNING_KEY ?? "";

type CalendlyWebhookPayload = {
  event?: string;
  payload?: {
    email?: string;
    name?: string;
    first_name?: string;
    last_name?: string;
    tracking?: {
      utm_source?: string;
    };
    scheduled_event?: {
      start_time?: string;
      end_time?: string;
      uri?: string;
      event_type?: string;
      name?: string;
      location?: { join_url?: string; type?: string };
    };
    cancel_url?: string;
    reschedule_url?: string;
  };
};

// Calendly signs webhooks with a header shaped:
//   t=1680000000,v1=hex-sha256
// Signed payload is `${t}.${rawBody}`.
function verifySignature(rawBody: string, header: string | null): boolean {
  if (!SIGNING_KEY) return true; // dev mode — accept
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.split("=").map((s) => s.trim())),
  ) as Record<string, string>;
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const signed = `${t}.${rawBody}`;
  const expected = crypto
    .createHmac("sha256", SIGNING_KEY)
    .update(signed)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const header = req.headers.get("calendly-webhook-signature");
  if (!verifySignature(rawBody, header)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: CalendlyWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // We only care about new bookings. Future: handle invitee.canceled
  // to flip status back if someone cancels before the interview.
  if (body.event !== "invitee.created") {
    return NextResponse.json({ ok: true, ignored: body.event });
  }

  const p = body.payload ?? {};
  const draftId = (p.tracking?.utm_source ?? "").trim();
  const email = (p.email ?? "").trim().toLowerCase();
  const startTime = p.scheduled_event?.start_time ?? null;
  const eventUri = p.scheduled_event?.uri ?? null;
  const joinUrl = p.scheduled_event?.location?.join_url ?? null;
  const rescheduleUrl = p.reschedule_url ?? null;
  const cancelUrl = p.cancel_url ?? null;

  const { db } = getFirebaseAdmin();
  let docId: string | null = null;

  // Match by draft_id first (most reliable — set from our apply page
  // Calendly embed URL).
  if (draftId) {
    const ref = db.collection("careers_applications").doc(draftId);
    const snap = await ref.get();
    if (snap.exists) docId = draftId;
  }

  // Fallback: match by email on the most recent application for that
  // address. Only takes effect if the draft_id lookup missed.
  if (!docId && email) {
    const q = await db
      .collection("careers_applications")
      .where("email", "==", email)
      .orderBy("last_updated_at", "desc")
      .limit(1)
      .get();
    if (!q.empty) docId = q.docs[0].id;
  }

  if (!docId) {
    // No matching application — accept the webhook but note it so we
    // don't throw a signature-looking error back at Calendly.
    return NextResponse.json({ ok: true, matched: false });
  }

  await db.collection("careers_applications").doc(docId).set(
    {
      status: "booked",
      booked_at: FieldValue.serverTimestamp(),
      calendly_event_start_time: startTime,
      calendly_event_uri: eventUri,
      calendly_join_url: joinUrl,
      calendly_reschedule_url: rescheduleUrl,
      calendly_cancel_url: cancelUrl,
      last_updated_at: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true, matched: true, id: docId });
}
