// Verifies a Stripe payment intent succeeded for the regrowth kit, then
// grants the kit entitlement on the user's Firestore doc.
//
// Mirrors /api/razorpay/kit/verify. Client-driven verify (mobile calls
// this after Stripe SDK reports success). Server fetches the payment
// intent via Stripe API to confirm status — can't trust client-passed
// success since it's spoof-able.
//
// On success this writes regrowth_treatment_purchased = true. Stripe
// webhook on payment_intent.succeeded would be a stronger safety net
// for orphaned-success cases (browser/app crash mid-flow); deferred.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-11-20.acacia",
});

interface VerifyPayload {
  paymentIntentId: string;
  firebaseUid: string;
  photoHeroOptIn?: boolean;
}

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "stripe_secret_key_not_configured" },
      { status: 500 }
    );
  }

  let payload: VerifyPayload;
  try {
    payload = (await req.json()) as VerifyPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { paymentIntentId, firebaseUid } = payload;
  if (!paymentIntentId || !firebaseUid) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  // Pull the payment intent from Stripe directly — the mobile client's
  // success signal alone isn't trustworthy since a tampered client could
  // claim success without a real charge.
  let intent: Stripe.PaymentIntent;
  try {
    intent = await stripe.paymentIntents.retrieve(paymentIntentId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe/kit/verify] retrieve failed:", err);
    return NextResponse.json({ ok: false, error: "intent_retrieve_failed" }, { status: 500 });
  }

  if (intent.status !== "succeeded") {
    // eslint-disable-next-line no-console
    console.warn(
      `[stripe/kit/verify] intent ${paymentIntentId} status=${intent.status} (not succeeded) for uid=${firebaseUid}`
    );
    return NextResponse.json(
      { ok: false, error: "intent_not_succeeded", status: intent.status },
      { status: 400 }
    );
  }

  // Sanity check — uid metadata on the intent should match the caller.
  if (intent.metadata?.uid && intent.metadata.uid !== firebaseUid) {
    // eslint-disable-next-line no-console
    console.error(
      `[stripe/kit/verify] uid mismatch: intent.metadata.uid=${intent.metadata.uid} caller=${firebaseUid}`
    );
    return NextResponse.json({ ok: false, error: "uid_mismatch" }, { status: 400 });
  }

  // Grant the kit entitlement.
  const { db } = getFirebaseAdmin();
  await db.collection("Users").doc(firebaseUid).set(
    {
      regrowth_treatment_purchased: true,
      regrowth_kit_paid_at: FieldValue.serverTimestamp(),
      regrowth_kit_payment_provider: "stripe",
      regrowth_kit_stripe_payment_intent_id: paymentIntentId,
      ...(payload.photoHeroOptIn || intent.metadata?.photo_hero === "true"
        ? { photo_hero_opted_in: true }
        : {}),
      modified_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // eslint-disable-next-line no-console
  console.log(
    `[stripe/kit/verify] kit granted to ${firebaseUid} (intent=${paymentIntentId} amount=${intent.amount})`
  );

  return NextResponse.json({ ok: true });
}
