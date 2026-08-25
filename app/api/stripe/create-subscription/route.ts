// Bootstrap endpoint for the web onboarding paywall.
//
// Creates a Stripe **Checkout Session** (hosted) instead of an inline
// subscription — user gets redirected to checkout.stripe.com to pay,
// then bounces back to /start/success?session_id={CHECKOUT_SESSION_ID}.
// The webhook (subscribed to `checkout.session.completed`) seeds the
// Firestore User doc + mints the Firebase custom token in PendingClaims.
//
// Flow:
//   1. Client sends { email, quizAnswers }.
//   2. Look up / create passwordless Firebase user for that email.
//   3. Create a Stripe customer tagged with app_user_id = <uid>.
//   4. Create a Checkout Session in subscription mode with a 7-day trial.
//      Subscription metadata carries quiz answers so downstream (webhook,
//      RC, dashboard) can attribute.
//   5. Return the hosted checkout URL — client does window.location.href.

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const TRIAL_DAYS = 7;
const SUCCESS_URL =
  "https://www.keshah.com/start/success?session_id={CHECKOUT_SESSION_ID}";
const CANCEL_URL = "https://www.keshah.com/start";

type QuizAnswers = {
  selected_gender?: string;
  gender?: string;
  hair_goal?: string;
  hair_loss_location?: string;
  commitment_answer?: string;
  first_name?: string;
  phone_number?: string;
  referral_source?: string;
  signup_source?: string;
  timezone?: string;
  timezone_offset_mins?: number | string;
  plan_key?: string;
  [k: string]: unknown;
};

function str(v: unknown): string {
  if (v === null || v === undefined) return "";
  return String(v);
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

  let body: { quizAnswers?: QuizAnswers };
  try {
    body = (await req.json()) as { quizAnswers?: QuizAnswers };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json_body" },
      { status: 400 },
    );
  }

  const quiz: QuizAnswers = body.quizAnswers || {};

  try {
    // No email required from the client — Stripe Checkout collects it
    // directly (mandatory for subscriptions) and the webhook creates the
    // Firebase user off customer_details.email once payment completes.
    // Zero pre-payment friction — user just hits Stripe.

    // Subscription metadata — attached to the subscription created inside
    // the Checkout Session so the webhook can seed the Firestore doc
    // without another network hop.
    const gender = str(quiz.selected_gender || quiz.gender);
    const subscriptionMetadata: Record<string, string> = {
      plan_key: str(quiz.plan_key) || "stoppage_trial",
      product: "stoppage_subscription",
      source: "web_onboarding_paywall",
      gender,
      hair_goal: str(quiz.hair_goal),
      hair_loss_location: str(quiz.hair_loss_location),
      commitment_answer: str(quiz.commitment_answer),
      first_name: str(quiz.first_name),
      phone_number: str(quiz.phone_number),
      referral_source: str(quiz.referral_source),
      signup_source: str(quiz.signup_source) || "web_onboarding",
      timezone: str(quiz.timezone),
      timezone_offset_mins: str(quiz.timezone_offset_mins),
      trial_days: String(TRIAL_DAYS),
    };

    // Create the hosted Checkout Session — Stripe generates the customer
    // + collects the email during checkout.
    // In subscription mode Stripe always creates a customer, so we don't
    // pass customer_creation. Email is collected on the Stripe hosted
    // page — webhook uses that email to find/create the Firebase user.
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      subscription_data: {
        trial_period_days: TRIAL_DAYS,
        metadata: subscriptionMetadata,
      },
      metadata: {
        source: "web_onboarding_paywall",
      },
      // Reassurance right above the Subscribe button — the moment of
      // decision. Mirrors what's under the CTA on our trial paywall.
      custom_text: {
        submit: {
          message: "No payment today. Cancel easily in app anytime.",
        },
      },
      success_url: SUCCESS_URL,
      cancel_url: CANCEL_URL,
      // Wallets (Apple Pay / Google Pay / Link) come on by default in
      // subscription mode.
      allow_promotion_codes: true,
    });

    if (!session.url) {
      return NextResponse.json(
        { ok: false, error: "no_checkout_url" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      url: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe/create-subscription]", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
