// Razorpay webhook handler for subscription lifecycle events.
// Handles auto-renewal (re-grants RC entitlement) and cancellation.
//
// SETUP: In Razorpay Dashboard → Settings → Webhooks → Add:
//   URL: https://www.keshah.com/api/razorpay/webhook
//   Secret: (set any string, then add as RAZORPAY_WEBHOOK_SECRET env var)
//   Events: subscription.charged, subscription.cancelled, subscription.halted

import { NextResponse } from "next/server";
import { createHmac } from "crypto";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

const PLAN_DURATION: Record<string, string> = {
  plan_SeFkQVq6KZCndb: "monthly",
  plan_SeFkQzYJzIpX1n: "three_month",
};

function verifyWebhookSignature(body: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

async function grantRCEntitlement(firebaseUid: string, duration: string): Promise<void> {
  const rcKey = process.env.RC_API_SECRET_KEY;
  if (!rcKey) throw new Error("RC_API_SECRET_KEY not set");

  const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(firebaseUid)}/entitlements/stoppage_treatment/promotional`;

  const res = await fetch(url, {
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
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // If webhook secret is configured, verify. Otherwise accept
  // (allows initial testing without the secret set).
  if (process.env.RAZORPAY_WEBHOOK_SECRET && !verifyWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 400 });
  }

  let event: {
    event: string;
    payload: {
      subscription: {
        entity: {
          id: string;
          plan_id: string;
          notes: Record<string, string>;
          customer_email?: string;
        };
      };
      payment?: {
        entity: {
          id: string;
        };
      };
    };
  };

  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const sub = event.payload?.subscription?.entity;
  if (!sub) {
    return NextResponse.json({ ok: true, skipped: "no_subscription" });
  }

  const { db } = getFirebaseAdmin();

  // Resolution order for the Firestore user doc:
  //   1. razorpay_subscription_id field (set by /verify or a prior webhook)
  //   2. notes.uid     (set by /create-order if the user was authed at paywall)
  //   3. customer_email (orphan-recovery: user paid anon, then signed in later
  //      with a different UID — links the payment to the authed account).
  let userDoc: FirebaseFirestore.DocumentSnapshot | null = null;

  const byId = await db.collection("Users").where("razorpay_subscription_id", "==", sub.id).limit(1).get();
  if (!byId.empty) userDoc = byId.docs[0];

  if (!userDoc && sub.notes?.uid) {
    const ref = await db.collection("Users").doc(sub.notes.uid).get();
    if (ref.exists) userDoc = ref;
  }

  if (!userDoc && sub.customer_email) {
    const byEmail = await db
      .collection("Users")
      .where("email", "==", sub.customer_email.toLowerCase())
      .limit(1)
      .get();
    if (!byEmail.empty) userDoc = byEmail.docs[0];
  }

  if (!userDoc) {
    // eslint-disable-next-line no-console
    console.error(`[razorpay/webhook] No user found for sub ${sub.id} (notes.uid=${sub.notes?.uid ?? "-"}, email=${sub.customer_email ?? "-"})`);
    return NextResponse.json({ ok: true, skipped: "user_not_found" });
  }

  const firebaseUid = userDoc.id;
  const duration = PLAN_DURATION[sub.plan_id] ?? "monthly";

  const userData = userDoc.data() ?? {};
  const wasOnTrial = userData.trial_status === "active";

  // Backfill razorpay_subscription_id if we resolved via notes.uid / email —
  // next webhook (cancel, renewal) will hit the fast path on id lookup.
  if (userData.razorpay_subscription_id !== sub.id) {
    await userDoc.ref.update({ razorpay_subscription_id: sub.id });
  }

  try {
    switch (event.event) {
      case "subscription.charged": {
        // First Day-7 charge after a trial = trial→paid conversion. Grant
        // the full 3-month entitlement (replaces the 7-day trial entitlement).
        // Subsequent charges (e.g., 3-month renewal) take the same path.
        await grantRCEntitlement(firebaseUid, duration);
        const updates: Record<string, unknown> = {};
        if (wasOnTrial) {
          updates.trial_status = "converted";
          updates.paid_at = FieldValue.serverTimestamp();
          // eslint-disable-next-line no-console
          console.log(`[razorpay/webhook] Trial converted for ${firebaseUid} → ${duration}`);
        } else {
          // eslint-disable-next-line no-console
          console.log(`[razorpay/webhook] Renewed ${firebaseUid} for ${duration}`);
        }
        if (Object.keys(updates).length > 0) {
          await userDoc.ref.update(updates);
        }
        break;
      }
      case "subscription.cancelled":
      case "subscription.halted": {
        // Mark trial as cancelled if they bailed during trial window. RC
        // promotional entitlements expire on their own — no need to revoke.
        if (wasOnTrial) {
          await userDoc.ref.update({
            trial_status: "cancelled",
            trial_cancelled_at: FieldValue.serverTimestamp(),
          });
        }
        // eslint-disable-next-line no-console
        console.log(`[razorpay/webhook] Subscription ${event.event} for ${firebaseUid}`);
        break;
      }
      default:
        // eslint-disable-next-line no-console
        console.log(`[razorpay/webhook] Unhandled event: ${event.event}`);
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[razorpay/webhook] error:", err);
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
