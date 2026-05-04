// Verifies a Razorpay one-time order payment signature for the regrowth
// kit, then grants the kit entitlement on the user's Firestore doc.
//
// One-time order signature body: payment_id|order_id (NOT same as
// subscriptions which sign payment_id|subscription_id).
//
// On success this writes regrowth_treatment_purchased = true so the app
// recognizes the user as a kit owner. The Razorpay webhook is the
// safety net if this client-driven verify fails (browser closed,
// network drop, etc.).

import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

interface VerifyPayload {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  firebaseUid: string;
  email?: string;
  photoHeroOptIn?: boolean;
}

function verifySignature(orderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  // One-time order signature body: order_id|payment_id
  const body = `${orderId}|${paymentId}`;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

export async function POST(req: Request) {
  let payload: VerifyPayload;
  try {
    payload = (await req.json()) as VerifyPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, firebaseUid } = payload;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !firebaseUid) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  if (!verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
    // eslint-disable-next-line no-console
    console.error(
      `[razorpay/kit/verify] signature mismatch order=${razorpay_order_id} payment=${razorpay_payment_id} uid=${firebaseUid}`
    );
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  // Signature valid → grant the kit entitlement. This mirrors what the
  // mobile app does after Stripe success in regrowth_plan_summary.dart's
  // _onCheckout — but server-side, so the write is trustworthy.
  const { db } = getFirebaseAdmin();
  await db.collection("Users").doc(firebaseUid).set(
    {
      regrowth_treatment_purchased: true,
      regrowth_kit_paid_at: FieldValue.serverTimestamp(),
      regrowth_kit_payment_provider: "razorpay",
      regrowth_kit_razorpay_order_id: razorpay_order_id,
      regrowth_kit_razorpay_payment_id: razorpay_payment_id,
      // Photo Hero opt-in: drives the month-4 photo prompt + Aadi-side
      // review tooling. Stored only when explicitly opted in.
      ...(payload.photoHeroOptIn ? { photo_hero_opted_in: true } : {}),
      modified_at: FieldValue.serverTimestamp(),
    },
    { merge: true }
  );

  // eslint-disable-next-line no-console
  console.log(`[razorpay/kit/verify] kit granted to ${firebaseUid} (order=${razorpay_order_id})`);

  return NextResponse.json({ ok: true });
}
