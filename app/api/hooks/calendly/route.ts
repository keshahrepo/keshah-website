// Calendly webhook receiver — invitee.created events.
//
// Wire this URL into Calendly's Webhook Subscriptions
// (Integrations → API & Webhooks → Webhook Subscriptions) for the
// invitee.created event.
//
// Handles two event types by slug (extracted from scheduled_event.uri):
//   regrowth-consultation-clone → onboarding call (post-purchase)
//   regrowth-consultation       → regrowth consultation (Regrowth tab)
//
// For each match, looks up the user by invitee email and writes the
// booked_at + scheduled_start + join_url + calendly_event_uri fields
// to the user doc. All-done card in the Flutter app reads these to
// render the confirmation banner.
//
// Auth: Calendly does not sign webhooks by default, but a shared
// secret can be added via the CALENDLY_WEBHOOK_SECRET env var — when
// set, we require it as ?secret= on the URL. Skip in dev if unset.

import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

interface CalendlyInviteePayload {
  event?: string;
  payload?: {
    email?: string;
    scheduled_event?: {
      uri?: string;
      start_time?: string;
      end_time?: string;
      location?: {
        type?: string;
        join_url?: string;
        location?: string;
      };
    };
    // Some Calendly payload shapes nest the event slug in a
    // separate event_type field.
    event_type?: {
      slug?: string;
      uri?: string;
    };
  };
}

// Slug → field prefix in user doc. Prefix keeps the two call types
// isolated so booking one doesn't overwrite the other.
const SLUG_TO_PREFIX: Record<string, string> = {
  "regrowth-consultation-clone": "onboarding_call",
  "regrowth-consultation": "regrowth_consultation",
};

function extractSlug(uri: string | undefined): string | null {
  if (!uri) return null;
  // event_type URIs look like:
  // https://api.calendly.com/event_types/{uuid}
  // scheduled_event URIs look like:
  // https://api.calendly.com/scheduled_events/{uuid}
  // Neither carries the slug directly — the slug is on the public
  // booking URL. We fall back to matching against the human-readable
  // event name via scheduled_event.name in the payload if present.
  return null;
}

function slugFromScheduledEventName(name?: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes("clone") || lower.includes("onboarding"))
    return "regrowth-consultation-clone";
  if (lower.includes("regrowth consultation") ||
      lower.includes("regrowth-consultation"))
    return "regrowth-consultation";
  if (lower.includes("microneedling masterclass"))
    return "microneedling-masterclass";
  return null;
}

export async function POST(req: NextRequest) {
  // Optional shared-secret guard (Calendly doesn't sign by default).
  const requiredSecret = process.env.CALENDLY_WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided = req.nextUrl.searchParams.get("secret");
    if (provided !== requiredSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = (await req.json().catch(() => null)) as
    | (CalendlyInviteePayload & { payload?: { scheduled_event?: { name?: string } } })
    | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  if (body.event !== "invitee.created") {
    // Silently ack unrelated events so Calendly doesn't retry.
    return NextResponse.json({ ok: true, skipped: body.event });
  }

  const email = body.payload?.email?.toLowerCase()?.trim();
  const eventUri = body.payload?.scheduled_event?.uri;
  const startTimeIso = body.payload?.scheduled_event?.start_time;
  const joinUrl =
    body.payload?.scheduled_event?.location?.join_url ??
    body.payload?.scheduled_event?.location?.location ??
    null;

  const slug =
    slugFromScheduledEventName(body.payload?.scheduled_event?.name) ??
    extractSlug(body.payload?.event_type?.uri);
  const prefix = slug ? SLUG_TO_PREFIX[slug] : null;

  if (!email || !prefix || !eventUri || !startTimeIso) {
    return NextResponse.json({
      ok: true,
      skipped: "missing_fields",
      email: !!email,
      prefix,
      eventUri: !!eventUri,
      startTimeIso: !!startTimeIso,
    });
  }

  const { db } = getFirebaseAdmin();
  const userSnap = await db
    .collection("Users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (userSnap.empty) {
    return NextResponse.json({ ok: true, skipped: "user_not_found", email });
  }
  const userDoc = userSnap.docs[0];

  const startTime = new Date(startTimeIso);
  const updates: Record<string, unknown> = {
    [`${prefix}_booked_at`]: Timestamp.now(),
    [`${prefix}_scheduled_start`]: Timestamp.fromDate(startTime),
    [`${prefix}_calendly_event_uri`]: eventUri,
    [`${prefix}_join_url`]: joinUrl,
  };
  await userDoc.ref.update(updates);

  return NextResponse.json({ ok: true, prefix, uid: userDoc.id });
}
