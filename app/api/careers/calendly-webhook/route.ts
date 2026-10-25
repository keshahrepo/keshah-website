// Calendly webhook for the group interview.
//   invitee.created   "awaiting_booking" → "booked" with the booking fields.
//                     Never touches a decided application (accepted /
//                     denied / withdrawn): that booking is only noted.
//   invitee.canceled  a real cancel (payload.rescheduled false/absent): the
//                     booking fields are removed, booking_canceled_at set and
//                     status goes back to "awaiting_booking" (unless decided
//                     or they already sent a video), so no 1h / start /
//                     no-show texts go out. A reschedule sends
//                     invitee.canceled (rescheduled: true), then
//                     invitee.created for the new time; the first is ignored
//                     and the second overwrites the booking.
//
// Setup: scripts/_setup_careers_calendly_webhook.ts creates the subscription
// (both events, with a signing key). The signing key goes in Vercel env as
// CALENDLY_WEBHOOK_SIGNING_KEY; the endpoint then verifies the
// Calendly-Webhook-Signature header. If the env var is unset, verification is
// skipped (with a warning in the logs).
//
// Matching to the applicant doc uses the tracking.utm_source field,
// which the apply page sets to the Firestore draft_id when it builds
// the Calendly URL. Falls back to invitee email if utm_source is empty
// (e.g. someone navigated to the raw Calendly link, not through our
// apply flow — then we still want to capture them if the email
// matches an existing application). The email fallback is
// findApplicationByEmail: newest active application, so it's deterministic.

import { NextResponse } from "next/server";
import crypto from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { APPLICATIONS, ensureSessionForStart, findApplicationByEmail } from "@/lib/interview";
import { BOOKING_FIELDS, cancelDecision, isDecided, outsideUsTimezone, statusAfterCancel } from "@/lib/interview-decisions";

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
    /** Invitee's IANA timezone, e.g. "America/Chicago". */
    timezone?: string;
    /** invitee.canceled: true when the cancel is half of a reschedule. */
    rescheduled?: boolean;
  };
};

let warnedNoKey = false;

// Calendly signs webhooks with a header shaped:
//   t=1680000000,v1=hex-sha256
// Signed payload is `${t}.${rawBody}`.
function verifySignature(rawBody: string, header: string | null): boolean {
  if (!SIGNING_KEY) {
    // Accept unsigned (first-run convenience), but say so once per instance.
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn("calendly webhook: CALENDLY_WEBHOOK_SIGNING_KEY is not set, so signatures are not checked.");
    }
    return true;
  }
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

  if (body.event !== "invitee.created" && body.event !== "invitee.canceled") {
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
  const inviteeTimezone = p.timezone ?? null;

  const { db } = getFirebaseAdmin();
  let docId: string | null = null;

  // Match by draft_id first (most reliable — set from our apply page
  // Calendly embed URL).
  if (draftId) {
    const snap = await db.collection(APPLICATIONS).doc(draftId).get();
    if (snap.exists) docId = draftId;
  }

  // Fallback: the newest active application for that email (else the
  // newest one). Only takes effect if the draft_id lookup missed.
  if (!docId && email) {
    docId = (await findApplicationByEmail(db, email))?.id ?? null;
  }

  if (body.event === "invitee.canceled") {
    if (p.rescheduled === true) return NextResponse.json({ ok: true, ignored: "reschedule" });
    if (!docId) return NextResponse.json({ ok: true, matched: false });
    const ref = db.collection(APPLICATIONS).doc(docId);
    const result = await db.runTransaction(async (tx) => {
      const cur = ((await tx.get(ref)).data() ?? {}) as Record<string, unknown>;
      const decision = cancelDecision(cur, { rescheduled: p.rescheduled, event_uri: eventUri, start_time: startTime });
      if (decision !== "clear") return decision;
      const patch: Record<string, unknown> = {
        booking_canceled_at: FieldValue.serverTimestamp(),
        booking_canceled_start_time: cur.calendly_event_start_time ?? null,
        last_updated_at: FieldValue.serverTimestamp(),
      };
      for (const f of BOOKING_FIELDS) patch[f] = FieldValue.delete();
      const next = statusAfterCancel(cur);
      if (next) patch.status = next;
      tx.set(ref, patch, { merge: true });
      return decision;
    });
    return NextResponse.json({ ok: true, matched: true, id: docId, canceled: result });
  }

  // Every group-interview time gets its interview session automatically
  // (live QR, live counter, follow-ups), even if this booking didn't match an
  // application. Never fails the webhook; the reminders cron retries.
  let session: string | null = null;
  try {
    session = (await ensureSessionForStart(db, startTime))?.slug ?? null;
  } catch (e) {
    console.error("calendly webhook: ensure session failed:", e instanceof Error ? e.message : e);
  }

  if (!docId) {
    // No matching application — accept the webhook but note it so we
    // don't throw a signature-looking error back at Calendly.
    return NextResponse.json({ ok: true, matched: false, session });
  }

  const ref = db.collection(APPLICATIONS).doc(docId);
  const decided = await db.runTransaction(async (tx) => {
    const cur = ((await tx.get(ref)).data() ?? {}) as Record<string, unknown>;
    if (isDecided(cur.status)) {
      // Already accepted / denied / withdrawn: never flip it back to booked.
      // Just note the booking so the founder can see it.
      tx.set(
        ref,
        { booked_after_decision_at: FieldValue.serverTimestamp(), booked_after_decision_start_time: startTime },
        { merge: true },
      );
      return true;
    }
    tx.set(
      ref,
      {
        status: "booked",
        booked_at: FieldValue.serverTimestamp(),
        calendly_event_start_time: startTime,
        calendly_event_uri: eventUri,
        calendly_join_url: joinUrl,
        calendly_reschedule_url: rescheduleUrl,
        calendly_cancel_url: cancelUrl,
        calendly_invitee_timezone: inviteeTimezone,
        // US-only hiring: flagged for the dashboard, not auto-denied (could be a US student travelling).
        outside_us_timezone: outsideUsTimezone(inviteeTimezone) ? inviteeTimezone : FieldValue.delete(),
        booking_canceled_at: FieldValue.delete(),
        booking_canceled_start_time: FieldValue.delete(),
        last_updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    return false;
  });

  return NextResponse.json({ ok: true, matched: true, id: docId, session, ...(decided ? { decided: true } : {}) });
}
