// Activates a 7-day free trial for a user.
//
// Flow: user on /tryfree taps "Start trial" → frontend calls /create-order
// with trial:true (creates Razorpay subscription with start_at = now+7days)
// → user authorizes UPI mandate via Razorpay Checkout → frontend POSTs to
// THIS endpoint with the mandate auth response.
//
// We:
// 1. Verify the subscription signature
// 2. Grant a 7-day RC promotional entitlement (so they have access during trial)
// 3. Save Firestore doc with trial_status, razorpay subscription IDs, plan
// 4. Return ok — frontend navigates to PurchaseSuccess
//
// On Day 7 the existing webhook fires `subscription.charged` and grants
// the full 3-month entitlement (replaces the 7-day one).

import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

interface StartTrialPayload {
  razorpay_subscription_id: string;
  razorpay_payment_id: string; // ₹5 mandate auth payment
  razorpay_signature: string;
  firebaseUid: string;
  plan: "monthly" | "threeMonth" | "monthlyPremium" | "monthlyV2";
  /** Trial length in days. Defaults to 7 (from /tryfree). /startindiafree
   *  sends 1 for the 1-day trial variant. RC promotional grant falls back
   *  to the nearest supported duration. */
  trialDays?: number;
}

const PLAN_TO_RC_DURATION: Record<string, string> = {
  monthly: "monthly",
  threeMonth: "three_month",
  monthlyPremium: "monthly",
  monthlyV2: "monthly",
};

function verifySignature(subscriptionId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const body = `${paymentId}|${subscriptionId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

async function grantRCTrialEntitlement(
  firebaseUid: string,
  trialDays: number
): Promise<void> {
  const rcKey = process.env.RC_API_SECRET_KEY;
  if (!rcKey) throw new Error("RC_API_SECRET_KEY not set");

  const subscriberUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(firebaseUid)}`;
  // Ensure subscriber exists (auto-creates on GET).
  await fetch(subscriberUrl, {
    headers: { Authorization: `Bearer ${rcKey}` },
  });

  // RC promotional durations don't include "1 day" — nearest supported is
  // "three_day". For trials shorter than a week we grant three_day; longer
  // trials get "weekly". Slight generosity on the low end doesn't matter
  // since the webhook replaces the promo grant with the paid entitlement
  // once the first real charge fires.
  const duration = trialDays <= 3 ? "three_day" : "weekly";

  const grantUrl = `${subscriberUrl}/entitlements/stoppage_treatment/promotional`;
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
    throw new Error(`RC ${duration} grant failed (${res.status}): ${text}`);
  }
}

export async function POST(req: Request) {
  let payload: StartTrialPayload;
  try {
    payload = (await req.json()) as StartTrialPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { razorpay_subscription_id, razorpay_payment_id, razorpay_signature, firebaseUid, plan } = payload;

  if (!razorpay_subscription_id || !razorpay_payment_id || !razorpay_signature || !firebaseUid || !plan) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_fields",
        debug: {
          has_sub_id: !!razorpay_subscription_id,
          has_pay_id: !!razorpay_payment_id,
          has_sig: !!razorpay_signature,
          has_uid: !!firebaseUid,
          has_plan: !!plan,
        },
      },
      { status: 400 }
    );
  }

  if (!verifySignature(razorpay_subscription_id, razorpay_payment_id, razorpay_signature)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  if (!PLAN_TO_RC_DURATION[plan]) {
    return NextResponse.json({ ok: false, error: "invalid_plan" }, { status: 400 });
  }

  const trialDays = Math.max(1, payload.trialDays ?? 7);

  try {
    await grantRCTrialEntitlement(firebaseUid, trialDays);

    // Mark this user as on a trial so the webhook can detect the
    // trial-to-paid conversion when the first real charge fires.
    const trialEndsAt = Timestamp.fromMillis(
      Date.now() + trialDays * 24 * 60 * 60 * 1000
    );
    try {
      const { db } = getFirebaseAdmin();
      const docRef = db.collection("Users").doc(firebaseUid);
      const existing = await docRef.get();
      const existingData = existing.exists ? existing.data() ?? {} : {};
      const update: Record<string, unknown> = {
        razorpay_subscription_id,
        razorpay_plan: plan,
        razorpay_payment_id,
        plan,
        payment_provider: "razorpay",
        trial_status: "active",
        trial_days: trialDays,
        trial_ends_at: trialEndsAt,
      };
      // Immutable timestamps — set ONCE.
      if (!existingData.trial_started_at) {
        update.trial_started_at = FieldValue.serverTimestamp();
      }
      if (!existingData.first_paid_at) {
        // Trial activation = first paid event for cohort purposes (the user
        // committed via UPI mandate even if no money has cleared yet).
        update.first_paid_at = FieldValue.serverTimestamp();
      }
      await docRef.set(update, { merge: true });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[razorpay/start-trial] Firestore update failed:", e);
    }

    return NextResponse.json({ ok: true, trialEndsAt: trialEndsAt.toMillis() });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/start-trial] error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "trial_failed" },
      { status: 500 }
    );
  }
}
