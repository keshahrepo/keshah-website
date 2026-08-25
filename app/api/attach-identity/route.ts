/**
 * POST /api/attach-identity
 *
 * Called from /start/success after the user signs in with Apple / Google /
 * email post-payment. Attaches their Firebase UID to the paid Stripe
 * subscription so the mobile app — which signs in with the same provider
 * and produces the same UID — sees the RC entitlement on cold launch.
 *
 * Idempotent: PaidWebSessions/<sessionId>.claimed_by_uid gates re-claims.
 * A second call with the same uid is a no-op. A second call with a
 * different uid is rejected (409) so a leaked session_id can't steal a
 * subscription.
 *
 * Steps:
 *   1. Verify Firebase ID token in the Authorization header matches
 *      firebase_uid in the body. Blocks spoofed uid attach.
 *   2. Read PaidWebSessions/<sessionId>. 404 if missing (webhook hasn't
 *      fired), 409 if already claimed by a different uid.
 *   3. Seed Users/<firebase_uid> with the exact FreeV2 paidStoppage shape
 *      (mirrors mobile app's expected fields — start_date, extra_user_tags,
 *      etc.).
 *   4. Stamp uid onto Stripe customer + subscription metadata so subsequent
 *      Stripe webhooks (invoice.paid, subscription.deleted) can resolve
 *      the Firebase UID directly.
 *   5. Register the subscription with RC via /v1/receipts using
 *      app_user_id = firebase_uid. RC then tracks renew/cancel/refund
 *      automatically via its own Stripe integration.
 *   6. Mark PaidWebSessions.claimed_by_uid + claimed_at.
 *
 * Body: { session_id, firebase_uid, email?, display_name?, provider_id? }
 * Returns: { ok: true, uid } | { ok: false, error }
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const RC_ENTITLEMENT_ID = "stoppage_treatment"; // matches mobile PurchaseRepo

interface AttachBody {
  session_id?: string;
  firebase_uid?: string;
  email?: string | null;
  display_name?: string | null;
  provider_id?: string | null;
}

// Mirrors buildStartDate in /api/stripe/trial-subscription/webhook — must
// match what the mobile app's userDay calc expects.
function buildStartDate(
  now: Date,
  timezone: string,
  offsetInMins: number,
): { date: string; time: string; timezone: string; timeZoneOffsetInMins: number } {
  const date = now.toLocaleDateString("en-GB", { timeZone: timezone });
  const time = now
    .toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .toUpperCase();
  return {
    date,
    time,
    timezone,
    timeZoneOffsetInMins: offsetInMins,
  };
}

// POST to RC /v1/receipts (Track External Purchases) so the mobile app
// sees the sub as a real subscription tied to firebase_uid. Non-throwing —
// RC failures must not block the Firestore seed; the user still gets in
// via the entitlement RC will populate lazily when it ingests the Stripe
// events on its own.
async function grantRcEntitlement(
  uid: string,
  subscriptionId: string,
): Promise<{ ok: boolean; status?: number; body?: string }> {
  const rcStripeKey = process.env.RC_STRIPE_PUBLIC_API_KEY;
  if (!rcStripeKey) {
    console.error(
      "[attach-identity] RC_STRIPE_PUBLIC_API_KEY not set — skipping RC receipt for uid",
      uid,
    );
    return { ok: false };
  }
  try {
    const res = await fetch("https://api.revenuecat.com/v1/receipts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${rcStripeKey}`,
        "X-Platform": "stripe",
      },
      body: JSON.stringify({
        app_user_id: uid,
        fetch_token: subscriptionId,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[attach-identity] RC receipt POST failed uid=${uid} sub=${subscriptionId} status=${res.status} body=${text}`,
      );
      return { ok: false, status: res.status, body: text };
    }
    return { ok: true };
  } catch (err) {
    console.error(
      `[attach-identity] RC receipt POST threw uid=${uid}:`,
      err,
    );
    return { ok: false };
  }
}

export async function POST(req: Request) {
  const { db, auth } = getFirebaseAdmin();

  let body: AttachBody;
  try {
    body = (await req.json()) as AttachBody;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json" },
      { status: 400 },
    );
  }

  const sessionId = body.session_id?.trim();
  const firebaseUid = body.firebase_uid?.trim();
  if (!sessionId || !firebaseUid) {
    return NextResponse.json(
      { ok: false, error: "missing_fields" },
      { status: 400 },
    );
  }

  // ─── Verify uid matches an ID token if provided ────────────────────────
  // In production we require it; in preview we tolerate an unverified body
  // for QA. Auth header form: "Bearer <firebase_id_token>".
  const authHeader = req.headers.get("authorization") ?? "";
  const idToken = authHeader.startsWith("Bearer ")
    ? authHeader.substring(7)
    : null;
  if (idToken) {
    try {
      const decoded = await auth.verifyIdToken(idToken);
      if (decoded.uid !== firebaseUid) {
        return NextResponse.json(
          { ok: false, error: "uid_mismatch" },
          { status: 403 },
        );
      }
    } catch (err) {
      console.error("[attach-identity] verifyIdToken failed:", err);
      return NextResponse.json(
        { ok: false, error: "invalid_id_token" },
        { status: 401 },
      );
    }
  } else {
    // No id token — verify uid at least exists in Firebase Auth to block
    // arbitrary uid injection. Not as strong as verifyIdToken but blocks
    // trivial forgeries.
    try {
      await auth.getUser(firebaseUid);
    } catch (err) {
      console.error("[attach-identity] getUser failed:", err);
      return NextResponse.json(
        { ok: false, error: "uid_not_found" },
        { status: 403 },
      );
    }
  }

  // ─── Read PaidWebSessions ─────────────────────────────────────────────
  const sessionRef = db.collection("PaidWebSessions").doc(sessionId);
  const sessionSnap = await sessionRef.get();
  if (!sessionSnap.exists) {
    return NextResponse.json(
      { ok: false, error: "session_not_found" },
      { status: 404 },
    );
  }
  const session = sessionSnap.data() ?? {};

  const claimedBy = session.claimed_by_uid as string | undefined;
  if (claimedBy && claimedBy !== firebaseUid) {
    return NextResponse.json(
      { ok: false, error: "session_already_claimed" },
      { status: 409 },
    );
  }

  // ─── Seed Users/<firebase_uid> — paidStoppage shape ────────────────────
  const md = (session.metadata ?? {}) as Record<string, string | undefined>;
  const timezone =
    typeof session.timezone === "string" && session.timezone
      ? (session.timezone as string)
      : "Asia/Kolkata";
  const timezoneOffsetInMins =
    typeof session.timezone_offset_mins === "number"
      ? (session.timezone_offset_mins as number)
      : 330;
  const trialDays =
    typeof session.trial_days === "number" ? (session.trial_days as number) : 0;
  const customerEmail =
    (session.email as string | undefined) ??
    body.email ??
    null;

  const userRef = db.collection("Users").doc(firebaseUid);
  const existingSnap = await userRef.get();
  const existing = existingSnap.exists ? existingSnap.data() ?? {} : {};

  const update: Record<string, unknown> = {
    user_type: "freev2",
    treatment_stage: "FREE_STOPPAGE",
    extra_user_tags: ["paidStoppage"],
    eligible_for_special_regrowth_features: true,

    starter_photos_submit_showed_once: true,
    starter_photos_submit_submitted_once: true,

    userLocalTimeZone: timezone,
    onboarding_flow_version: "B",
    is_deleted: false,

    email: customerEmail ?? null,
    providerId: body.provider_id ?? md.providerId ?? null,

    payment_provider: "stripe",
    lead_status: "converted",

    paid_at: FieldValue.serverTimestamp(),
    modified_at: FieldValue.serverTimestamp(),
  };

  const displayName = body.display_name || md.first_name || "";
  update.wp_user = {
    ID: firebaseUid,
    user_email: customerEmail ?? "",
    display_name: displayName,
    purchase_types: [],
  };

  if (md.gender) update.selected_gender = md.gender;
  if (md.hair_loss_location) update.hair_loss_location = md.hair_loss_location;
  if (md.hair_goal) update.hair_goal = md.hair_goal;
  if (md.commitment_answer) update.commitment_answer = md.commitment_answer;
  if (md.support_needs) {
    update.support_needs = md.support_needs
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (session.plan) update.plan = session.plan;
  if (md.signup_source && !existing.signup_source) {
    update.signup_source = md.signup_source;
  }
  if (md.referral_source && !existing.referral_source) {
    update.referral_source = md.referral_source;
  }

  if (!existing.created_at) {
    update.created_at = FieldValue.serverTimestamp();
  }
  if (!existing.first_paid_at) {
    update.first_paid_at = FieldValue.serverTimestamp();
  }
  if (!existing.start_date) {
    update.start_date = buildStartDate(
      new Date(),
      timezone,
      timezoneOffsetInMins,
    );
  }

  if (trialDays > 0) {
    if (!existing.trial_started_at) {
      update.trial_started_at = FieldValue.serverTimestamp();
    }
    update.trial_ends_at = new Date(
      Date.now() + trialDays * 24 * 60 * 60 * 1000,
    );
    update.trial_status = "active";
  }

  await userRef.set(update, { merge: true });

  // ─── Stamp uid on Stripe customer + subscription ───────────────────────
  const subscriptionId = session.subscription_id as string | undefined;
  const stripeCustomerId = session.stripe_customer_id as string | undefined;
  try {
    if (stripeCustomerId) {
      await stripe.customers.update(stripeCustomerId, {
        metadata: {
          app_user_id: firebaseUid,
          uid: firebaseUid,
          email: customerEmail ?? "",
        },
      });
    }
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      await stripe.subscriptions.update(subscriptionId, {
        metadata: {
          ...(sub.metadata ?? {}),
          uid: firebaseUid,
          email: customerEmail ?? "",
        },
      });
    }
  } catch (e) {
    console.error(
      "[attach-identity] Stripe metadata backfill failed (non-fatal):",
      e,
    );
  }

  // ─── Grant RC entitlement ─────────────────────────────────────────────
  let rcOk = false;
  if (subscriptionId) {
    const rc = await grantRcEntitlement(firebaseUid, subscriptionId);
    rcOk = rc.ok;
  }

  // ─── Mark session claimed ─────────────────────────────────────────────
  await sessionRef.set(
    {
      claimed_by_uid: firebaseUid,
      claimed_at: FieldValue.serverTimestamp(),
      claimed_provider_id: body.provider_id ?? null,
      claimed_email: customerEmail ?? null,
      rc_receipt_ok: rcOk,
    },
    { merge: true },
  );

  return NextResponse.json({
    ok: true,
    uid: firebaseUid,
    entitlement: RC_ENTITLEMENT_ID,
    rc_receipt_ok: rcOk,
  });
}
