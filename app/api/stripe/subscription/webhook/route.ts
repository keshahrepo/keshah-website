// Stripe webhook — mirrors regrowth-subscription state to Firestore.
//
// Events we act on:
//   invoice.paid (first invoice of a new subscription) →
//     - regrowth_treatment_purchased: true
//     - regrowth_subscription_id
//     - regrowth_subscription_plan_key
//     - regrowth_subscription_started_at
//
//   customer.subscription.deleted (or updated → status:canceled) →
//     - regrowth_subscription_cancelled_at
//     - (leaves regrowth_treatment_purchased true — per stopgap policy,
//       user paid, they keep access)
//
// Anything else is logged + acked so Stripe stops retrying.
//
// SETUP:
//   Stripe Dashboard → Developers → Webhooks → Add endpoint:
//     URL:      https://www.keshah.com/api/stripe/subscription/webhook
//     Events:   invoice.paid, customer.subscription.deleted,
//               customer.subscription.updated
//   Copy the signing secret into STRIPE_SUBSCRIPTION_WEBHOOK_SECRET in
//   Vercel env.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

export async function POST(req: Request) {
  const signingSecret = process.env.STRIPE_SUBSCRIPTION_WEBHOOK_SECRET;
  if (!signingSecret) {
    return NextResponse.json(
      { ok: false, error: "webhook_secret_not_configured" },
      { status: 500 },
    );
  }
  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json(
      { ok: false, error: "missing_signature" },
      { status: 400 },
    );
  }
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, signingSecret);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe/subscription/webhook] signature verify failed:", err);
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 400 },
    );
  }

  const { db } = getFirebaseAdmin();

  try {
    switch (event.type) {
      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;

        // Fetch subscription to get its metadata (uid, plan_key).
        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const uid = sub.metadata?.uid;
        const planKey = sub.metadata?.plan_key;
        if (!uid) {
          console.error(
            "[stripe/subscription/webhook] invoice.paid missing uid metadata",
            subscriptionId,
          );
          break;
        }

        // Only mark started on the FIRST invoice — subsequent renewals
        // shouldn't overwrite started_at.
        const ref = db.collection("Users").doc(uid);
        const snap = await ref.get();
        const existing = snap.data() ?? {};

        const updates: Record<string, unknown> = {
          regrowth_treatment_purchased: true,
          regrowth_subscription_id: subscriptionId,
          regrowth_subscription_plan_key: planKey ?? null,
          regrowth_subscription_last_invoice_at: FieldValue.serverTimestamp(),
          modified_at: FieldValue.serverTimestamp(),
        };
        if (!existing.regrowth_subscription_started_at) {
          updates.regrowth_subscription_started_at =
            FieldValue.serverTimestamp();
        }
        // If they cancelled then resubscribed, clear the cancel marker.
        if (existing.regrowth_subscription_cancelled_at) {
          updates.regrowth_subscription_cancelled_at = FieldValue.delete();
        }
        await ref.set(updates, { merge: true });
        break;
      }

      case "customer.subscription.deleted":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const isCancelled =
          event.type === "customer.subscription.deleted" ||
          sub.status === "canceled" ||
          sub.cancel_at_period_end === true;
        if (!isCancelled) break;
        const uid = sub.metadata?.uid;
        if (!uid) break;

        await db.collection("Users").doc(uid).set(
          {
            regrowth_subscription_cancelled_at:
              sub.canceled_at
                ? Timestamp.fromMillis(sub.canceled_at * 1000)
                : FieldValue.serverTimestamp(),
            regrowth_subscription_cancel_at_period_end:
              sub.cancel_at_period_end,
            modified_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        break;
      }

      default:
        // No-op — ack so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(
      `[stripe/subscription/webhook] handler error for ${event.type}:`,
      err,
    );
    // Return 500 so Stripe retries.
    return NextResponse.json({ ok: false, error: "handler_error" }, {
      status: 500,
    });
  }

  return NextResponse.json({ ok: true, event_type: event.type });
}
