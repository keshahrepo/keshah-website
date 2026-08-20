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
      // TEMP DIAGNOSTIC (remove after fixing) — logs redacted samples so we
      // can compare what RC is sending against what Vercel env holds.
      const redact = (s: string) => s.length <= 8 ? "***" : `${s.slice(0, 4)}…${s.slice(-4)} (len=${s.length})`;
      // eslint-disable-next-line no-console
      console.error(`[rc/webhook] AUTH_MISMATCH provided=${redact(provided)} expected=${redact(expectedAuth)}`);
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

  // CANCELLATION is handled separately — no paid-user reconciliation, just
  // stamp subscription_cancelled_at + subscription_status so the trial funnel
  // can count cancels. Fires whenever a user cancels their subscription
  // (before or after billing) — the entitlement stays active until the
  // period end (EXPIRATION), so this is a "will not renew" signal.
  if (evt.type === "CANCELLATION") {
    const uidForCancel = resolveFirebaseUid(evt);
    if (!uidForCancel) {
      // eslint-disable-next-line no-console
      console.log(`[rc/webhook] CANCELLATION for anonymous id=${evt.app_user_id} — skipping (no fb uid)`);
      return NextResponse.json({ ok: true, skipped: "cancellation_anonymous" });
    }
    const { db } = getFirebaseAdmin();
    await db.collection("Users").doc(uidForCancel).set(
      {
        subscription_status: "cancelled",
        subscription_cancelled_at: FieldValue.serverTimestamp(),
        subscription_cancelled_product_id: evt.product_id ?? null,
        modified_at: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
    // eslint-disable-next-line no-console
    console.log(`[rc/webhook] CANCELLATION recorded for ${uidForCancel} (product=${evt.product_id ?? "-"})`);
    return NextResponse.json({ ok: true, uid: uidForCancel, event_type: "CANCELLATION" });
  }

  // Skip events we don't act on (EXPIRATION, BILLING_ISSUE, SUBSCRIBER_ALIAS,
  // etc.). Just log + 200 so RC doesn't retry.
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
    // Auto-recovery: if RC sent us $email in subscriber_attributes (Stripe
    // attaches it on checkout), look up the matching Firebase user. If the
    // user exists, alias the anonymous RC customer to their Firebase UID
    // server-side. This catches the case where the user closed the browser
    // before reaching SignUp on web — alias still happens once they (or
    // anyone) signs up with the same email later.

    if (email) {
      try {
        const { db } = getFirebaseAdmin();
        const byEmail = await db
          .collection("Users")
          .where("email", "==", email)
          .limit(1)
          .get();

        if (!byEmail.empty) {
          const targetUid = byEmail.docs[0].id;
          const rcKey = process.env.RC_API_SECRET_KEY;
          if (rcKey) {
            // POST /v1/subscribers/{anon_id}/alias (SINGULAR) with
            // new_app_user_id = Firebase UID. RC merges them server-side;
            // the entitlement becomes visible on both IDs.
            //
            // CRITICAL: endpoint is /alias singular, NOT /aliases. The
            // plural form returns 405 Method Not Allowed silently — this
            // bug shipped here for weeks before being caught when a
            // customer (Nicholas Tapp, 2026-05-08) reported their paid
            // status not showing on mobile. The auto-recovery never
            // actually recovered anyone until this fix.
            const aliasResp = await fetch(
              `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(evt.app_user_id)}/alias`,
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${rcKey}`,
                  "Content-Type": "application/json",
                  "X-Platform": "stripe",
                },
                body: JSON.stringify({ new_app_user_id: targetUid }),
              }
            );
            if (aliasResp.ok) {
              // eslint-disable-next-line no-console
              console.log(
                `[rc/webhook] AUTO_ALIAS: anon=${evt.app_user_id} → ${targetUid} (email=${email})`
              );
              // Fall through and reconcile Firestore on the recovered UID.
              // Re-resolve so the rest of this handler updates the right doc.
              return reconcileFirestoreDoc(targetUid, email, evt);
            }
            const errText = await aliasResp.text().catch(() => "");
            // eslint-disable-next-line no-console
            console.error(
              `[rc/webhook] AUTO_ALIAS failed status=${aliasResp.status} body=${errText.slice(0, 200)}`
            );
          }
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[rc/webhook] AUTO_ALIAS exception:`, err);
      }
    }

    // No matching Firebase user yet — store the orphan in
    // PendingRcAliases so save-profile can pick it up when the user
    // eventually signs up. This handles the race where the user pays,
    // closes the browser, signs up minutes/hours/days later. The pending
    // record carries enough data to alias once a Firebase UID exists.
    if (email) {
      try {
        const { db } = getFirebaseAdmin();
        await db
          .collection("PendingRcAliases")
          .doc(evt.app_user_id)
          .set(
            {
              email,
              anonAppUserId: evt.app_user_id,
              eventType: evt.type,
              productId: evt.product_id ?? null,
              transactionId: evt.transaction_id ?? null,
              createdAt: FieldValue.serverTimestamp(),
            },
            { merge: true }
          );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[rc/webhook] PendingRcAliases write failed:`, err);
      }
    }

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

  return reconcileFirestoreDoc(firebaseUid, email, evt);
}

// Reconciles the Firestore Users/{uid} doc with paid-user state. Used both
// in the normal happy path (alias resolved firebaseUid) AND after the
// auto-recovery alias above. Idempotent — only writes fields that are
// missing or wrong.
async function reconcileFirestoreDoc(
  firebaseUid: string,
  email: string | undefined,
  evt: RcWebhookEvent["event"]
): Promise<NextResponse> {
  const { db } = getFirebaseAdmin();
  const docRef = db.collection("Users").doc(firebaseUid);
  const snap = await docRef.get();
  const existing = snap.exists ? (snap.data() ?? {}) : {};

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

  // ── Clean lifecycle signals (dedicated fields with unambiguous
  // semantics — see AppConsts.startedTrialFieldName in mobile).
  //
  // started_trial fires for any INITIAL_PURCHASE (safety net — mobile
  // paywall writes it too, but this catches orphan/aliased purchases
  // where the client write never lands). Idempotent: only set if
  // missing. Object shape mirrors mobile: { at, product_id, source }.
  const isInitialPurchase = evt.type === "INITIAL_PURCHASE";
  if (isInitialPurchase && !existing.started_trial) {
    updates.started_trial = {
      at: FieldValue.serverTimestamp(),
      product_id: evt.product_id ?? null,
      source: "webhook_initial_purchase",
    };
  }

  // converted_trial fires when the trial converts to a real billing
  // event. Two cases:
  //   1. RENEWAL — trial ended, first paid period started billing
  //   2. INITIAL_PURCHASE with period_type=NORMAL — direct paid,
  //      no free trial phase, they converted the moment they subscribed
  // Both write once (idempotent). PRODUCT_CHANGE / UNCANCELLATION do
  // NOT count — they act on already-active subscriptions and would
  // muddy the "trial → paid conversion" definition.
  const isRenewal = evt.type === "RENEWAL";
  const isDirectPaid =
    isInitialPurchase && evt.period_type && evt.period_type.toUpperCase() === "NORMAL";
  if ((isRenewal || isDirectPaid) && !existing.converted_trial) {
    updates.converted_trial = {
      at: FieldValue.serverTimestamp(),
      product_id: evt.product_id ?? null,
      source: isRenewal ? "webhook_renewal" : "webhook_direct_paid",
    };
  }

  // First-time-only fields. Don't overwrite real values; only set if missing.
  if (!existing.first_paid_at) {
    updates.first_paid_at = FieldValue.serverTimestamp();

    // First paid event → snapshot the last nurture click so we can attribute
    // this conversion to a specific email/SMS/WhatsApp touch. 7-day window.
    // Anything longer is too noisy to attribute cleanly.
    const lastClick = existing.nurture_last_click as
      | { day?: number; channel?: string; dest?: string; at?: FirebaseFirestore.Timestamp }
      | undefined;
    if (lastClick?.at) {
      const clickMs = lastClick.at.toMillis?.() ?? 0;
      const withinWindow = Date.now() - clickMs <= 7 * 86_400_000;
      if (withinWindow) {
        updates.nurture_conversion_channel = lastClick.channel ?? "unknown";
        updates.nurture_conversion_day = lastClick.day ?? null;
        updates.nurture_conversion_dest = lastClick.dest ?? null;
        updates.nurture_conversion_captured_at = FieldValue.serverTimestamp();
      }
    }
  }
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

  // UNCANCELLATION means the user reactivated after cancelling — clear the
  // cancelled fields so the trial funnel doesn't double-count them.
  if (evt.type === "UNCANCELLATION" && existing.subscription_status === "cancelled") {
    updates.subscription_status = "active";
    updates.subscription_cancelled_at = FieldValue.delete();
    updates.subscription_cancelled_product_id = FieldValue.delete();
  }

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
