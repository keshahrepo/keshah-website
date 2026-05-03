// RevenueCat webhook handler — server-side safety net for the US web funnel.
//
// Why this exists:
//   The /start (Web Billing) flow grants entitlement client-side via
//   `aliasToUser(firebaseUid)` and writes Firestore via fire-and-forget
//   save-profile. Both can fail silently (network blip, browser close before
//   SignUp finishes). This webhook catches those failures by reconciling
//   the Firestore Users doc whenever RevenueCat says a paid event occurred.
//
//   For the worst case — anonymous purchase where the browser closed before
//   alias — we log the orphan so support can manually link it. RC's webhook
//   includes `aliases[]`; if no Firebase UID is in there, we can't auto-recover.
//
// SETUP:
//   RC Dashboard → Project → Integrations → Webhooks → Add:
//     URL:        https://www.keshah.com/api/revenuecat/webhook
//     Auth:       set "Authorization Header Value" to a random string,
//                 add it to Vercel as REVENUECAT_WEBHOOK_AUTH
//     Events:     subscribe at minimum to INITIAL_PURCHASE, RENEWAL,
//                 NON_RENEWING_PURCHASE, PRODUCT_CHANGE
//
// MIRRORS:
//   /api/razorpay/webhook handles the equivalent India path. Logic is
//   intentionally similar — same resolution order (id → notes → email),
//   same "backfill missing fields" approach.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// Events that should mark the user as paid and ensure the FreeV2 fields
// are written. Critically TRANSFER must be here — when a paid-anonymous
// user signs up and aliasToUser runs, RC fires TRANSFER with the destination
// Firebase UID as app_user_id. INITIAL_PURCHASE on /start typically fires
// with an anonymous app_user_id (purchase happens before SignUp) and our
// resolver will return null → logged as "pending alias" until TRANSFER
// arrives.
const PAID_EVENT_TYPES = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
  "TRANSFER",
]);

interface RcWebhookEvent {
  api_version?: string;
  event: {
    type: string;
    id: string;
    app_user_id: string;
    aliases?: string[];
    original_app_user_id?: string;
    subscriber_attributes?: Record<string, { value: string }>;
    product_id?: string;
    period_type?: string;
    purchased_at_ms?: number;
    expiration_at_ms?: number | null;
    environment?: "SANDBOX" | "PRODUCTION";
    store?: string;
    transaction_id?: string;
  };
}

function isAnonymousId(id: string | undefined): boolean {
  return !!id && id.startsWith("$RCAnonymousID:");
}

// Pick the first non-anonymous ID across (app_user_id, aliases). That's the
// Firebase UID after `aliasToUser` ran on web. If everything is anonymous,
// the user closed the browser before signup — we can't auto-recover.
function resolveFirebaseUid(event: RcWebhookEvent["event"]): string | null {
  const candidates = [event.app_user_id, ...(event.aliases ?? [])].filter(Boolean);
  return candidates.find((c) => !isAnonymousId(c)) ?? null;
}

export async function POST(req: Request) {
  // RC sends the auth header value the dashboard was configured with —
  // verify it matches our env var. If env var is unset, accept everything
  // (allows initial wiring without breaking).
  const expectedAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (expectedAuth) {
    const provided = req.headers.get("authorization") ?? "";
    if (provided !== expectedAuth && provided !== `Bearer ${expectedAuth}`) {
      return NextResponse.json({ ok: false, error: "invalid_auth" }, { status: 401 });
    }
  }

  let payload: RcWebhookEvent;
  try {
    payload = (await req.json()) as RcWebhookEvent;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const evt = payload.event;
  if (!evt?.type) {
    return NextResponse.json({ ok: true, skipped: "no_event_type" });
  }

  // Skip events we don't act on (CANCELLATION, EXPIRATION, BILLING_ISSUE,
  // SUBSCRIBER_ALIAS, etc.). Just log + 200 so RC doesn't retry.
  if (!PAID_EVENT_TYPES.has(evt.type)) {
    // eslint-disable-next-line no-console
    console.log(`[rc/webhook] Skipping event type: ${evt.type} (id=${evt.id})`);
    return NextResponse.json({ ok: true, skipped: "event_type_not_handled" });
  }

  const firebaseUid = resolveFirebaseUid(evt);
  const email = evt.subscriber_attributes?.["$email"]?.value;

  if (!firebaseUid) {
    // Anonymous purchase, no Firebase UID resolved.
    //
    // For INITIAL_PURCHASE this is EXPECTED — on /start, payment happens
    // before SignUp, so the RC customer is anonymous. The TRANSFER event
    // that fires after `aliasToUser(firebaseUid)` is what carries the UID.
    // Don't treat this as an orphan; treat it as "waiting for alias."
    //
    // If the user closes the browser between payment and SignUp, no
    // TRANSFER will ever fire — the entitlement stays on the anon ID, and
    // a support ticket is the only path. Logged distinctively so we can
    // grep these out later.
    const isLikelyOrphan = evt.type !== "INITIAL_PURCHASE";
    // eslint-disable-next-line no-console
    console[isLikelyOrphan ? "error" : "log"](
      `[rc/webhook] ${isLikelyOrphan ? "ORPHAN" : "PENDING_ALIAS"}: ` +
        `app_user_id=${evt.app_user_id} email=${email ?? "-"} ` +
        `event=${evt.type} txn=${evt.transaction_id ?? "-"} ` +
        `product=${evt.product_id ?? "-"}`
    );
    return NextResponse.json({
      ok: true,
      skipped: isLikelyOrphan ? "orphan_anonymous" : "pending_alias",
    });
  }

  const { db } = getFirebaseAdmin();
  const docRef = db.collection("Users").doc(firebaseUid);
  const snap = await docRef.get();
  const existing = snap.exists ? (snap.data() ?? {}) : {};

  // Backfill the FreeV2 paid-user state. Mirrors save-profile/route.ts so
  // the Firestore doc looks identical whether SignUp finished or the
  // webhook had to recover. Only writes fields that are missing/wrong.
  const updates: Record<string, unknown> = {};

  // The discriminator the app uses for "this user is paid" is
  // extra_user_tags containing "paidStoppage" — see save-profile comment.
  const tags = (existing.extra_user_tags as string[] | undefined) ?? [];
  if (!tags.includes("paidStoppage")) {
    updates.extra_user_tags = [...tags, "paidStoppage"];
  }

  if (existing.user_type !== "freev2") updates.user_type = "freev2";
  if (existing.treatment_stage !== "FREE_STOPPAGE") {
    updates.treatment_stage = "FREE_STOPPAGE";
  }
  if (existing.eligible_for_special_regrowth_features !== true) {
    updates.eligible_for_special_regrowth_features = true;
  }
  if (existing.starter_photos_submit_submitted_once !== true) {
    updates.starter_photos_submit_submitted_once = true;
    updates.starter_photos_submit_showed_once = true;
  }
  if (existing.is_deleted === undefined) updates.is_deleted = false;

  // First-time-only fields. Don't overwrite real values; only set if missing.
  if (!existing.first_paid_at) updates.first_paid_at = FieldValue.serverTimestamp();
  if (!existing.created_at) updates.created_at = FieldValue.serverTimestamp();

  // wp_user.ID must equal the Firebase UID — the app keys identity off
  // wp_user.ID. If for some reason it's missing/wrong, fix it.
  const wpUser = (existing.wp_user as Record<string, unknown> | undefined) ?? {};
  if (wpUser.ID !== firebaseUid || (email && wpUser.user_email !== email)) {
    updates.wp_user = {
      ...wpUser,
      ID: firebaseUid,
      user_email: email ?? wpUser.user_email ?? existing.email ?? "",
      display_name: wpUser.display_name ?? "",
      purchase_types: wpUser.purchase_types ?? [],
    };
  }

  if (email && !existing.email) updates.email = email;

  // Always touch paid_at so analytics see latest paid event.
  updates.paid_at = FieldValue.serverTimestamp();
  updates.modified_at = FieldValue.serverTimestamp();
  updates.last_rc_event = {
    type: evt.type,
    id: evt.id,
    product_id: evt.product_id ?? null,
    received_at: FieldValue.serverTimestamp(),
  };

  await docRef.set(updates, { merge: true });

  // eslint-disable-next-line no-console
  console.log(
    `[rc/webhook] Reconciled ${firebaseUid} from event ${evt.type} ` +
      `(product=${evt.product_id ?? "-"}, fields_touched=${Object.keys(updates).length})`
  );

  return NextResponse.json({ ok: true, uid: firebaseUid, event_type: evt.type });
}
