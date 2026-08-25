// Bootstrap endpoint for the web onboarding paywall (PaymentStep).
//
// Flow:
//   1. Client sends { email, quizAnswers } after collecting the quiz.
//   2. We reuse the existing Firebase Auth user for that email, or create
//      a passwordless one so we have a stable UID before payment.
//   3. Create a Stripe customer tagged with app_user_id = <uid>.
//   4. Create a Stripe subscription with a 7-day trial and
//      payment_behavior=default_incomplete so the client can collect the
//      payment method via Elements / Payment Element using the returned
//      client secret. With a trial, Stripe attaches a SetupIntent
//      (pending_setup_intent) instead of a PaymentIntent — return whichever
//      is present so the client can confirm it.
//
// Firestore seeding + custom-token minting happen elsewhere (webhook +
// claim endpoint). This route only sets up the payment surface.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const TRIAL_DAYS = 7;

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

  let body: { email?: string; quizAnswers?: QuizAnswers };
  try {
    body = (await req.json()) as { email?: string; quizAnswers?: QuizAnswers };
  } catch {
    return NextResponse.json(
      { ok: false, error: "invalid_json_body" },
      { status: 400 },
    );
  }

  const email = body.email?.trim().toLowerCase();
  const quiz: QuizAnswers = body.quizAnswers || {};

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "invalid_email" },
      { status: 400 },
    );
  }

  try {
    const { auth } = getFirebaseAdmin();

    // 1. Get or create Firebase user (passwordless).
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(email);
      uid = existing.uid;
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "auth/user-not-found") {
        const created = await auth.createUser({
          email,
          emailVerified: false,
          disabled: false,
        });
        uid = created.uid;
      } else {
        throw err;
      }
    }

    // 2. Stripe customer. app_user_id is the standard tag RevenueCat / our
    //    webhooks read to resolve back to the Firebase UID.
    const customer = await stripe.customers.create({
      email,
      name: quiz.first_name ? str(quiz.first_name) : undefined,
      metadata: {
        app_user_id: uid,
        uid,
        email,
        source: "web_onboarding_paywall",
      },
    });
    const customerId = customer.id;

    // 3. Build subscription metadata — everything in the contract's
    //    stripeSubscriptionMetadata list. Stripe rejects non-string values
    //    and drops keys with empty strings on the dashboard, so coerce.
    const gender = str(quiz.selected_gender || quiz.gender);
    const subscriptionMetadata: Record<string, string> = {
      uid,
      plan_key: str(quiz.plan_key) || "stoppage_trial",
      product: "stoppage_subscription",
      source: "web_onboarding_paywall",
      gender,
      hair_goal: str(quiz.hair_goal),
      hair_loss_location: str(quiz.hair_loss_location),
      commitment_answer: str(quiz.commitment_answer),
      first_name: str(quiz.first_name),
      phone_number: str(quiz.phone_number),
      email,
      referral_source: str(quiz.referral_source),
      signup_source: str(quiz.signup_source) || "web_onboarding",
      timezone: str(quiz.timezone),
      timezone_offset_mins: str(quiz.timezone_offset_mins),
      trial_days: String(TRIAL_DAYS),
    };

    // 4. Create the subscription. With trial_period_days > 0 the first
    //    invoice is $0, so Stripe attaches a SetupIntent to
    //    pending_setup_intent instead of a PaymentIntent on latest_invoice.
    //    Expand both and return whichever secret exists.
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      trial_period_days: TRIAL_DAYS,
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent", "pending_setup_intent"],
      metadata: subscriptionMetadata,
    });

    const latestInvoice =
      subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent =
      latestInvoice?.payment_intent as Stripe.PaymentIntent | null;
    const setupIntent =
      subscription.pending_setup_intent as Stripe.SetupIntent | null;

    const clientSecret =
      paymentIntent?.client_secret ?? setupIntent?.client_secret ?? null;

    if (!clientSecret) {
      // eslint-disable-next-line no-console
      console.error(
        "[stripe/create-subscription] no client_secret on subscription",
        subscription.id,
      );
      return NextResponse.json(
        { ok: false, error: "no_client_secret" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      clientSecret,
      uid,
      customerId,
      subscriptionId: subscription.id,
      intentType: paymentIntent ? "payment_intent" : "setup_intent",
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
