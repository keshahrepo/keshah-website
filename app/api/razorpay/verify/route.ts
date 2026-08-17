// Verifies a Razorpay subscription payment signature, then grants the
// corresponding RC entitlement to the user's Firebase UID.
//
// For subscriptions, Razorpay signs: subscription_id|payment_id
// (not order_id|payment_id like one-time payments).

import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface VerifyPayload {
  razorpay_subscription_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  firebaseUid: string;
  plan: "monthly" | "threeMonth" | "weekly" | "monthlyV2" | "weeklyV2" | "monthlyPremium" | "weeklyPremium" | "monthlyPremium996";
}

const PLAN_TO_RC: Record<string, { entitlement: string; duration: string }> = {
  monthly:           { entitlement: "stoppage_treatment", duration: "monthly" },
  threeMonth:        { entitlement: "stoppage_treatment", duration: "three_month" },
  weekly:            { entitlement: "stoppage_treatment", duration: "weekly" },
  monthlyV2:         { entitlement: "stoppage_treatment", duration: "monthly" },
  weeklyV2:          { entitlement: "stoppage_treatment", duration: "weekly" },
  monthlyPremium:    { entitlement: "stoppage_treatment", duration: "monthly" },
  weeklyPremium:     { entitlement: "stoppage_treatment", duration: "weekly" },
  monthlyPremium996: { entitlement: "stoppage_treatment", duration: "monthly" },
};

function verifySignature(subscriptionId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  // Razorpay subscription signature body: payment_id|subscription_id
  const body = `${paymentId}|${subscriptionId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

async function grantRCEntitlement(firebaseUid: string, entitlement: string, duration: string): Promise<void> {
  const rcKey = process.env.RC_API_SECRET_KEY;
  if (!rcKey) throw new Error("RC_API_SECRET_KEY not set");

  const subscriberUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(firebaseUid)}`;

  // RC requires the subscriber to exist before /promotional accepts a
  // grant. For first-time web purchasers (no app install yet) RC has
  // never seen this UID — a GET implicitly creates the record.
  await fetch(subscriberUrl, {
    headers: { Authorization: `Bearer ${rcKey}` },
  });

  const grantUrl = `${subscriberUrl}/entitlements/${encodeURIComponent(entitlement)}/promotional`;

  const res = await fetch(grantUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rcKey}`,
    },
    body: JSON.stringify({ duration }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`RC grant failed (${res.status}): ${text}`);
  }
}

export async function POST(req: Request) {
  let payload: VerifyPayload;
  try {
    payload = (await req.json()) as VerifyPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature, firebaseUid, plan } = payload;

  if (!razorpay_subscription_id || !razorpay_payment_id || !razorpay_signature || !firebaseUid || !plan) {
    return NextResponse.json({
      ok: false,
      error: "missing_fields",
      debug: {
        has_sub_id: !!razorpay_subscription_id,
        has_pay_id: !!razorpay_payment_id,
        has_sig: !!razorpay_signature,
        has_uid: !!firebaseUid,
        has_plan: !!plan,
      },
    }, { status: 400 });
  }

  if (!verifySignature(razorpay_subscription_id, razorpay_payment_id, razorpay_signature)) {
    // Log details for debugging (no secrets exposed)
    const secret = process.env.RAZORPAY_KEY_SECRET;
    return NextResponse.json({
      ok: false,
      error: "invalid_signature",
      debug: {
        sub_id_prefix: razorpay_subscription_id.slice(0, 10),
        pay_id_prefix: razorpay_payment_id.slice(0, 10),
        sig_prefix: razorpay_signature.slice(0, 10),
        has_secret: !!secret,
        secret_len: secret?.length ?? 0,
      },
    }, { status: 400 });
  }

  const rcConfig = PLAN_TO_RC[plan];
  if (!rcConfig) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  try {
    await grantRCEntitlement(firebaseUid, rcConfig.entitlement, rcConfig.duration);

    // Store subscription ID on the user's Firestore doc so the renewal
    // webhook can look up which Firebase UID to re-grant entitlements for.
    // Also mirror to the unified fields (plan, payment_provider, paid_at)
    // used by the affiliate dashboard.
    //
    // first_paid_at is set ONCE on first paid event and never overwritten —
    // it's the canonical timestamp for cohort/tenure analysis.
    try {
      const { db } = getFirebaseAdmin();
      const docRef = db.collection("Users").doc(firebaseUid);
      const existing = await docRef.get();
      const hasFirstPaidAt = existing.exists && !!existing.data()?.first_paid_at;
      const update: Record<string, unknown> = {
        razorpay_subscription_id,
        razorpay_plan: plan,
        razorpay_payment_id,
        plan,
        payment_provider: "razorpay",
        paid_at: FieldValue.serverTimestamp(),
      };
      if (!hasFirstPaidAt) {
        update.first_paid_at = FieldValue.serverTimestamp();
      }
      await docRef.set(update, { merge: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[razorpay/verify] Failed to store subscription ID:", e);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/verify] RC grant error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "grant_failed" },
      { status: 500 }
    );
  }
}
