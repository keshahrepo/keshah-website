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
import crypto from "crypto";
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

// Fire a Meta StartTrial event via server-side CAPI. Called from the
// customer.subscription.created handler so every real trial-start signals
// Meta's ad optimizer — even when the user closed the browser before the
// success page loaded (client-side pixel wouldn't fire in that case).
//
// Attribution matching uses the fbp/fbc cookies we forwarded through
// Stripe metadata + the email captured at Checkout. Non-throwing —
// Meta downtime must NOT break payment processing.
async function fireStartTrialCapi(opts: {
  email: string | null;
  fbp: string | null;
  fbc: string | null;
  value: number;
  currency: string;
  eventId: string;
}): Promise<void> {
  // Bridge-domain test: if META_BRIDGE_PIXEL_ID + token + URL are all set,
  // fire to the fresh bridge pixel using the bridge URL as event_source_url.
  // Isolates whether Meta's health flag keys on URL vs BM/ad-account.
  // If any is missing, fall back to the original keshah pixel.
  const bridgePixelId = process.env.META_BRIDGE_PIXEL_ID;
  const bridgeToken = process.env.META_BRIDGE_CAPI_TOKEN;
  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL;
  const useBridge = Boolean(bridgePixelId && bridgeToken && bridgeUrl);

  const pixelId = useBridge
    ? bridgePixelId
    : process.env.NEXT_PUBLIC_FB_PIXEL_ID;
  const accessToken = useBridge
    ? bridgeToken
    : process.env.FB_CAPI_ACCESS_TOKEN;
  const testEventCode = useBridge
    ? process.env.META_BRIDGE_CAPI_TEST_EVENT_CODE
    : process.env.FB_CAPI_TEST_EVENT_CODE;
  const eventSourceUrl = useBridge ? bridgeUrl : undefined;
  if (!pixelId || !accessToken) return;

  const userData: Record<string, unknown> = {};
  if (opts.email) {
    userData.em = [
      crypto
        .createHash("sha256")
        .update(opts.email.trim().toLowerCase())
        .digest("hex"),
    ];
  }
  if (opts.fbp) userData.fbp = opts.fbp;
  if (opts.fbc) userData.fbc = opts.fbc;

  const event: Record<string, unknown> = {
    event_name: "StartTrial",
    event_time: Math.floor(Date.now() / 1000),
    event_id: opts.eventId,
    action_source: "website",
    user_data: userData,
    custom_data: {
      value: opts.value,
      currency: opts.currency,
      predicted_ltv: opts.value,
    },
  };
  if (eventSourceUrl) event.event_source_url = eventSourceUrl;
  const body: Record<string, unknown> = {
    data: [event],
    access_token: accessToken,
  };
  if (testEventCode) body.test_event_code = testEventCode;

  try {
    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(
        `[stripe/trial-subscription/webhook] StartTrial CAPI failed: ${res.status} ${text}`,
      );
    }
  } catch (err) {
    console.error(
      "[stripe/trial-subscription/webhook] StartTrial CAPI threw:",
      err,
    );
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
      // Inline-checkout /trial flow. Fires when the user confirms card via
      // stripe.confirmSetup(). We create the Subscription server-side here
      // — NOT at intent-creation time — so we never leak ghost subs for
      // users who bail on card entry. Standard customer.subscription.created
      // handler then runs downstream (writes PaidWebSessions keyed by the
      // SetupIntent id, fires StartTrial CAPI).
      case "setup_intent.succeeded": {
        const setupIntent = event.data.object as Stripe.SetupIntent;
        const md = setupIntent.metadata ?? {};

        // Not one of our /trial setup intents — bail. Guards against
        // stray SetupIntents (kit purchases, other flows) triggering
        // subscription creation.
        if (md.source !== "web_onboarding_paywall") {
          console.log(
            `[stripe/trial-subscription/webhook] setup_intent.succeeded skipped — source=${md.source ?? "none"} (not web_onboarding_paywall)`,
          );
          break;
        }

        const customerId =
          typeof setupIntent.customer === "string"
            ? setupIntent.customer
            : setupIntent.customer?.id;
        const paymentMethodId =
          typeof setupIntent.payment_method === "string"
            ? setupIntent.payment_method
            : setupIntent.payment_method?.id;
        const priceId = md.price_id;
        const trialDaysStr = md.trial_days;

        if (!customerId || !paymentMethodId || !priceId) {
          console.error(
            `[stripe/trial-subscription/webhook] setup_intent.succeeded missing fields: customer=${customerId} pm=${paymentMethodId} price=${priceId}`,
          );
          break;
        }

        // Update the customer with the real email captured by the
        // PaymentElement (billing_details) so downstream code + our
        // Users doc get the right address.
        try {
          const email = setupIntent.latest_attempt
            ? null
            : null; // latest_attempt doesn't carry email
          // The PaymentElement collects billingDetails.email on the
          // PaymentMethod itself — pull it there.
          const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
          const pmEmail = pm.billing_details?.email ?? email;
          if (pmEmail) {
            await stripe.customers.update(customerId, { email: pmEmail });
          }
        } catch (e) {
          console.warn(
            "[stripe/trial-subscription/webhook] customer email update failed:",
            e,
          );
        }

        // Idempotency: if a subscription already exists for this
        // customer, skip. Guards against duplicate webhook deliveries or
        // re-confirmed setup intents.
        const existing = await stripe.subscriptions.list({
          customer: customerId,
          limit: 1,
        });
        if (existing.data.length > 0) {
          console.log(
            `[stripe/trial-subscription/webhook] subscription already exists for customer ${customerId} — skipping create`,
          );
          break;
        }

        // Forward the same metadata bag to the Subscription so the
        // customer.subscription.created handler downstream has everything
        // it needs. Include setup_intent_id so PaidWebSessions gets keyed
        // by the setup_intent id — that's what the /success page URL
        // carries as session_id.
        const subMetadata: Record<string, string> = { ...md };
        subMetadata.setup_intent_id = setupIntent.id;
        // trial_days already in md; parse for the Stripe param
        const trialDays = trialDaysStr
          ? Number.parseInt(trialDaysStr, 10) || 0
          : 0;

        await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: priceId }],
          default_payment_method: paymentMethodId,
          trial_period_days: trialDays,
          metadata: subMetadata,
        });
        break;
      }

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

        // Timezone — fall back to America/New_York (majority of paid
        // traffic is US) when the client didn't send one. Old fallback
        // was Asia/Kolkata which made every US user's start_date look
        // like an IST timestamp on the mobile splash.
        const timezone =
          typeof md.timezone === "string" && md.timezone
            ? md.timezone
            : "America/New_York";
        const timezoneOffsetInMins = md.timezone_offset_mins
          ? Number.parseInt(md.timezone_offset_mins, 10) || -240
          : -240;
        const trialDays = md.trial_days
          ? Number.parseInt(md.trial_days, 10) || 0
          : 0;

        // Write PaidWebSessions/<sessionKey>. The success page reads by
        // whatever id its URL carries. Three flows produce sessionKey:
        //   - Hosted Checkout: Stripe Checkout Session id (cs_live_...).
        //   - Inline /trial Elements: SetupIntent id (from md.setup_intent_id).
        //   - Legacy fallback: subscription.id.
        // /trial's return_url passes ?session_id={setup_intent_id}, so we
        // key by setup_intent_id when it's present. Hosted Checkout takes
        // priority when neither of those apply; sub.id is the last fallback.
        const setupIntentId =
          typeof md.setup_intent_id === "string" && md.setup_intent_id
            ? md.setup_intent_id
            : null;
        const checkoutSessionId = setupIntentId
          ? null
          : await findCheckoutSessionId(sub.id);
        const sessionKey = setupIntentId ?? checkoutSessionId ?? sub.id;

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

        // Fire Meta StartTrial CAPI so Meta's ad optimizer gets a signal
        // for every real trial start — even when the user closed the
        // browser before the success page loaded (client-side pixel
        // wouldn't fire in that case). value = price after trial (99 USD).
        // fbp/fbc were captured client-side in PaymentStep + forwarded
        // through Stripe metadata so attribution matching works.
        // event_id = checkout session id (falls back to sub.id if this sub
        // didn't come from Checkout). Must match the sid that the bridge
        // page passes as its event_id — Stripe redirects the browser to
        // the bridge with `?sid={CHECKOUT_SESSION_ID}` right after payment.
        // Same event_id on both server + browser fires = Meta dedupes.
        await fireStartTrialCapi({
          email: customerEmail,
          fbp: md.fbp || null,
          fbc: md.fbc || null,
          value: 99,
          currency: "USD",
          eventId: sessionKey,
        });

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
