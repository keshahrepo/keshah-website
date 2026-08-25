// Stripe webhook for the WEB trial-purchase flow (FreeV2 paidStoppage).
//
// Distinct from /api/stripe/subscription/webhook — that one is for the
// Regrowth Kit subscription. This one handles the paywall trial purchase.
//
// This webhook DEFERS identity work. It only records the paid session in
// PaidWebSessions/<sessionId> with the metadata the app needs to seed a
// user doc. The actual Firebase user creation, Firestore seed, and
// RC receipt POST happen in /api/attach-identity — triggered after the
// user signs in with Apple/Google/email on the success page. That way
// the identity attached to the RC subscription is the SAME identity the
// user will produce when they sign into the mobile app with the same
// provider, so entitlements follow the user with zero handoff steps.
//
// Events we act on:
//
//   customer.subscription.created — user just completed Stripe Checkout.
//     Write PaidWebSessions/<sessionId> with email + metadata.
//     Do NOT create a Firebase user; identity is captured post-sign-in.
//
//   invoice.paid — first paid invoice after the trial elapses. Marks
//     subscription_active_at so we can distinguish "still in trial" from
//     "trial converted".
//
//   customer.subscription.deleted / .updated (cancelled) — marks
//     trial_cancelled_at.
//
// SETUP:
//   Stripe Dashboard → Developers → Webhooks → Add endpoint:
//     URL:     https://www.keshah.com/api/stripe/trial-subscription/webhook
//     Events:  customer.subscription.created, invoice.paid,
//              customer.subscription.deleted, customer.subscription.updated
//   Copy the signing secret into STRIPE_TRIAL_WEBHOOK_SECRET in Vercel env.
//
// REQUIRED ENV VARS:
//   STRIPE_SECRET_KEY               (already set)
//   STRIPE_TRIAL_WEBHOOK_SECRET     (already set)
//   FIREBASE_SERVICE_ACCOUNT        (already set)

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

export const runtime = "nodejs";
// Ensure raw body is available for signature verification.
export const dynamic = "force-dynamic";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Look up the Stripe Checkout Session ID that produced this subscription.
// The success page keys PaidWebSessions by session_id (that's what the URL
// carries). Returns null if this sub wasn't created via Checkout — the
// caller falls back to subscription.id.
async function findCheckoutSessionId(
  subscriptionId: string,
): Promise<string | null> {
  try {
    const list = await stripe.checkout.sessions.list({
      subscription: subscriptionId,
      limit: 1,
    });
    return list.data[0]?.id ?? null;
  } catch (err) {
    console.error(
      "[stripe/trial-subscription/webhook] checkout session lookup failed:",
      err,
    );
    return null;
  }
}

// Resolve the Firebase uid attached to a subscription. First checks the
// sub's metadata (set by /api/attach-identity when the user signs in),
// then falls back to PaidWebSessions.claimed_by_uid keyed by the
// Checkout Session ID.
async function resolveUidForSubscription(
  db: FirebaseFirestore.Firestore,
  sub: Stripe.Subscription,
): Promise<string | null> {
  const mdUid = sub.metadata?.uid;
  if (typeof mdUid === "string" && mdUid) return mdUid;

  const checkoutSessionId = await findCheckoutSessionId(sub.id);
  const key = checkoutSessionId ?? sub.id;
  const snap = await db.collection("PaidWebSessions").doc(key).get();
  if (!snap.exists) return null;
  const data = snap.data() ?? {};
  const uid = data.claimed_by_uid;
  return typeof uid === "string" && uid ? uid : null;
}

export async function POST(req: Request) {
  const signingSecret = process.env.STRIPE_TRIAL_WEBHOOK_SECRET;
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
    console.error(
      "[stripe/trial-subscription/webhook] signature verify failed:",
      err,
    );
    return NextResponse.json(
      { ok: false, error: "invalid_signature" },
      { status: 400 },
    );
  }

  const { db } = getFirebaseAdmin();

  try {
    switch (event.type) {
      case "customer.subscription.created": {
        const sub = event.data.object as Stripe.Subscription;
        const md = sub.metadata ?? {};

        // Pull email from the Stripe Customer object — Stripe Checkout
        // collected it, we didn't pre-provide it. The success page reads
        // this to pre-fill the email input on the sign-in step.
        let customerEmail: string | null = md.email || null;
        try {
          const customerId =
            typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
          if (customerId) {
            const customer = await stripe.customers.retrieve(customerId);
            if (customer && !("deleted" in customer && customer.deleted)) {
              customerEmail =
                (customer as Stripe.Customer).email ?? customerEmail;
            }
          }
        } catch (e) {
          console.error(
            "[stripe/trial-subscription/webhook] customer lookup failed:",
            e,
          );
        }

        // Timezone — fall back to Asia/Kolkata + IST offset to match the
        // funnel/save-profile behaviour when the client didn't send one.
        const timezone =
          typeof md.timezone === "string" && md.timezone
            ? md.timezone
            : "Asia/Kolkata";
        const timezoneOffsetInMins = md.timezone_offset_mins
          ? Number.parseInt(md.timezone_offset_mins, 10) || 330
          : 330;
        const trialDays = md.trial_days
          ? Number.parseInt(md.trial_days, 10) || 0
          : 0;

        // Write PaidWebSessions/<checkoutSessionId>. The success page
        // reads by Stripe Checkout session ID (which is what its URL
        // carries). Fall back to subscription.id if this sub didn't come
        // from Checkout (e.g. Payment Element flow).
        const checkoutSessionId = await findCheckoutSessionId(sub.id);
        const sessionKey = checkoutSessionId ?? sub.id;

        const customerId =
          typeof sub.customer === "string" ? sub.customer : sub.customer?.id;

        // Copy the metadata bag that /api/attach-identity uses to seed the
        // Users doc post-sign-in. Only forward strings we actually need.
        const forwardMd: Record<string, string> = {};
        for (const k of [
          "first_name",
          "gender",
          "hair_loss_location",
          "hair_goal",
          "commitment_answer",
          "support_needs",
          "signup_source",
          "referral_source",
          "providerId",
        ] as const) {
          const v = md[k];
          if (typeof v === "string" && v) forwardMd[k] = v;
        }

        await db.collection("PaidWebSessions").doc(sessionKey).set(
          {
            email: customerEmail ?? null,
            subscription_id: sub.id,
            stripe_customer_id: customerId ?? null,
            plan: md.plan_key ?? null,
            trial_days: trialDays,
            timezone,
            timezone_offset_mins: timezoneOffsetInMins,
            metadata: forwardMd,
            claimed_by_uid: null,
            claimed_at: null,
            created_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        break;
      }

      case "invoice.paid": {
        // First paid invoice after the trial elapses. Trial-created
        // sends invoice.paid too (with amount_paid=0 for trials);
        // guard on billing_reason so we only stamp subscription_active_at
        // when it's a real paid conversion.
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = invoice.subscription as string | null;
        if (!subscriptionId) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const uid = await resolveUidForSubscription(db, sub);
        if (!uid) {
          // User hasn't signed in / attached their identity yet. Skip —
          // they'll pick up the active status via the normal RC path when
          // they eventually sign in.
          console.warn(
            `[stripe/trial-subscription/webhook] invoice.paid: no uid resolved for sub ${sub.id}`,
          );
          break;
        }

        const isTrialInvoice = invoice.billing_reason === "subscription_create"
          && invoice.amount_paid === 0;
        if (isTrialInvoice) break;

        const userRef = db.collection("Users").doc(uid);
        const snap = await userRef.get();
        const existing = snap.exists ? snap.data() ?? {} : {};

        const updates: Record<string, unknown> = {
          modified_at: FieldValue.serverTimestamp(),
        };
        if (!existing.subscription_active_at) {
          updates.subscription_active_at = FieldValue.serverTimestamp();
        }
        // Trial converted — flip status so the reminder-email query
        // stops matching this user.
        if (existing.trial_status === "active") {
          updates.trial_status = "converted";
        }
        await userRef.set(updates, { merge: true });
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

        const uid = await resolveUidForSubscription(db, sub);
        if (!uid) {
          console.warn(
            `[stripe/trial-subscription/webhook] cancel event: no uid resolved for sub ${sub.id}`,
          );
          break;
        }

        await db.collection("Users").doc(uid).set(
          {
            trial_cancelled_at: sub.canceled_at
              ? Timestamp.fromMillis(sub.canceled_at * 1000)
              : FieldValue.serverTimestamp(),
            trial_status: "cancelled",
            subscription_cancel_at_period_end: sub.cancel_at_period_end,
            modified_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        // NOTE: no manual RC revoke. Track External Purchases + RC's
        // automatic Stripe webhook ingestion handles cancel/renewal/refund
        // for us — RC updates the entitlement based on Stripe's live sub
        // status. We just log our own trial_cancelled_at above for analytics.
        break;
      }

      default:
        // Ack unknown events so Stripe stops retrying.
        break;
    }
  } catch (err) {
    console.error(
      `[stripe/trial-subscription/webhook] handler error for ${event.type}:`,
      err,
    );
    // Return 500 so Stripe retries.
    return NextResponse.json(
      { ok: false, error: "handler_error" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, event_type: event.type });
}
