// Inline-checkout bootstrap — SetupIntent-only.
//
// Sister endpoint to /api/stripe/create-subscription (which creates a
// hosted Checkout Session + redirects). This one creates ONLY a Customer +
// a SetupIntent, and returns the SetupIntent's client_secret so the client
// can mount Stripe Elements inline.
//
// The actual Stripe Subscription is created LATER — in the webhook, when
// `setup_intent.succeeded` fires. That way we never create ghost
// subscriptions for users who bail on card entry: no Meta signal
// pollution, no Stripe cleanup burden, no failed-billing noise 7 days
// later on abandoned trials.
//
// SetupIntent metadata carries the subscription-creation params (price_id,
// trial_days, quiz answers, fbp/fbc for CAPI) so the webhook has
// everything it needs to build the sub without another round-trip.
//
// Flow:
//   1. Client posts { quizAnswers } (no email needed — Stripe's
//      PaymentElement collects billing_details.email inside the widget).
//   2. Server creates Customer with a placeholder email.
//   3. Server creates SetupIntent (customer attached, usage=off_session)
//      + metadata bag with everything needed to construct the subscription.
//   4. Server returns { setupIntentId, customerId, clientSecret, returnUrl,
//      publishableKey }.
//   5. Client mounts PaymentElement with clientSecret; on submit calls
//      stripe.confirmSetup({ return_url }) — Stripe attaches the payment
//      method to the customer + fires setup_intent.succeeded webhook +
//      redirects to /success.
//   6. Webhook (setup_intent.succeeded handler) reads metadata, creates
//      the Subscription with the confirmed payment_method as default.
//   7. customer.subscription.created handler fires, writes PaidWebSessions
//      (keyed by setup_intent id — so the /success page finds it) and
//      fires StartTrial CAPI. Only real conversions signal Meta.

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const TRIAL_DAYS = 7;

// The success page keys everything (PaidWebSessions doc, StartTrial event_id)
// on `session_id`. In the hosted-Checkout flow that's the Stripe Checkout
// Session id. Here it's the SetupIntent id — the webhook writes
// PaidWebSessions/{setup_intent.id} so the /success page's poll finds it.
function buildReturnUrl(fbp: string, fbc: string, setupIntentId: string): string {
  const bridgeUrl = process.env.NEXT_PUBLIC_BRIDGE_URL;
  const base = bridgeUrl
    ? bridgeUrl.replace(/\/$/, "")
    : "https://www.keshah.com";
  const params = new URLSearchParams();
  params.set("session_id", setupIntentId);
  params.set("value", "99");
  params.set("currency", "USD");
  if (fbp) params.set("fbp", fbp);
  if (fbc) params.set("fbc", fbc);
  return `${base}/success?${params.toString()}`;
}

type QuizAnswers = {
  selected_gender?: string;
  gender?: string;
  hair_goal?: string;
  hairGoal?: string;
  hair_loss_location?: string;
  hairLossLocation?: string;
  commitment_answer?: string;
  commitmentAnswer?: string;
  first_name?: string;
  firstName?: string;
  phone_number?: string;
  phoneNumber?: string;
  referral_source?: string;
  referralSource?: string;
  signup_source?: string;
  timezone?: string;
  timezone_offset_mins?: number | string;
  plan_key?: string;
  fbp?: string;
  fbc?: string;
  [k: string]: unknown;
};

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

interface Body {
  email?: string;
  quizAnswers?: QuizAnswers;
}

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "stripe_secret_key_not_configured" },
      { status: 500 },
    );
  }
  const priceId = process.env.STRIPE_TRIAL_PRICE_ID;
  if (!priceId) {
    return NextResponse.json(
      { ok: false, error: "stripe_trial_price_id_not_configured" },
      { status: 500 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json_body" },
      { status: 400 },
    );
  }

  const quiz: QuizAnswers = body.quizAnswers || {};

  try {
    const gender = str(quiz.selected_gender || quiz.gender);

    // Metadata bag — mirrors what the subscription eventually needs. The
    // setup_intent.succeeded webhook reads this to construct the sub.
    // Kept as a flat string map because that's all Stripe metadata
    // supports.
    const metadata: Record<string, string> = {
      // Subscription-creation params
      price_id: priceId,
      trial_days: String(TRIAL_DAYS),
      // Downstream fields the subscription webhook forwards to PaidWebSessions
      plan_key: str(quiz.plan_key) || "stoppage_trial",
      product: "stoppage_subscription",
      source: "web_onboarding_paywall",
      gender,
      hair_goal: str(quiz.hairGoal || quiz.hair_goal),
      hair_loss_location: str(
        quiz.hairLossLocation || quiz.hair_loss_location,
      ),
      commitment_answer: str(
        quiz.commitmentAnswer || quiz.commitment_answer,
      ),
      first_name: str(quiz.firstName || quiz.first_name),
      phone_number: str(quiz.phoneNumber || quiz.phone_number),
      referral_source: str(quiz.referralSource || quiz.referral_source),
      signup_source: str(quiz.signup_source) || "web_onboarding",
      timezone: str(quiz.timezone),
      timezone_offset_mins: str(quiz.timezone_offset_mins),
      // Meta attribution — forwarded so the webhook can fire a properly-
      // attributed CAPI event without recontacting the client.
      fbp: str(quiz.fbp),
      fbc: str(quiz.fbc),
    };

    // Placeholder customer. Real email is captured inside the
    // PaymentElement (billing_details.email) and Stripe updates the
    // customer with it during confirmSetup — we backfill via the webhook.
    const customer = await stripe.customers.create({
      metadata: {
        source: "web_onboarding_paywall",
        signup_source: "web_onboarding",
      },
    });

    // usage: 'off_session' so the saved payment method can be charged
    // later (when trial ends and the subscription bills).
    const setupIntent = await stripe.setupIntents.create({
      customer: customer.id,
      usage: "off_session",
      payment_method_types: ["card"],
      metadata,
    });

    if (!setupIntent.client_secret) {
      return NextResponse.json(
        { ok: false, error: "no_setup_intent_client_secret" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      setupIntentId: setupIntent.id,
      customerId: customer.id,
      clientSecret: setupIntent.client_secret,
      publishableKey:
        process.env.STRIPE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ??
        null,
      returnUrl: buildReturnUrl(
        str(quiz.fbp),
        str(quiz.fbc),
        setupIntent.id,
      ),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe/create-subscription-intent]", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
