// Cancels a user's Razorpay subscription. Authenticates via Firebase ID
// token (Authorization: Bearer <token>) and looks up the subscription ID
// from the user's Firestore doc written at verify time.
//
// Uses cancel_at_cycle_end so the user keeps access through the period
// they already paid for — no further charges, but no immediate loss of
// service either. The webhook fires subscription.cancelled in response
// and the RC promotional entitlement expires on its own schedule.

import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

export async function POST(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const idToken = authHeader.slice(7);

  const { auth, db } = getFirebaseAdmin();

  let uid: string;
  try {
    const decoded = await auth.verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_token" }, { status: 401 });
  }

  const docRef = db.collection("Users").doc(uid);
  const snap = await docRef.get();
  if (!snap.exists) {
    return NextResponse.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const data = snap.data() as Record<string, unknown>;
  const subId = data.razorpay_subscription_id as string | undefined;
  if (!subId) {
    return NextResponse.json({ ok: false, error: "no_subscription" }, { status: 400 });
  }

  // Idempotency — if already cancelled, return the stored end date
  if (data.razorpay_subscription_status === "cancelled") {
    return NextResponse.json({
      ok: true,
      alreadyCancelled: true,
      endsAt: data.razorpay_ends_at ?? null,
    });
  }

  let result: { current_end?: number; status?: string };
  try {
    // Razorpay SDK's cancel returns the updated subscription.
    // cancel_at_cycle_end: true keeps access through the paid period.
    result = (await razorpay.subscriptions.cancel(subId, true)) as typeof result;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/cancel-subscription] API error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "cancel_failed",
      },
      { status: 500 }
    );
  }

  const endsAt = result.current_end
    ? Timestamp.fromMillis(result.current_end * 1000)
    : null;

  try {
    await docRef.set(
      {
        razorpay_subscription_status: "cancelled",
        razorpay_cancelled_at: FieldValue.serverTimestamp(),
        razorpay_ends_at: endsAt,
      },
      { merge: true }
    );
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/cancel-subscription] Firestore update failed:", e);
  }

  return NextResponse.json({
    ok: true,
    endsAt: result.current_end ?? null,
    status: result.status ?? "cancelled",
  });
}
