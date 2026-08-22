// Stripe recurring subscription for the Regrowth Kit.
//
// Two plans (created via scripts/_stripe_create_regrowth_products.ts):
//   - regrowth_1mo: $199/mo recurring
//   - regrowth_4mo: $396 every 4 months recurring
//
// Mobile flow: modal → user picks plan → this endpoint → mobile opens
// Payment Sheet with the returned client secret. On success, subscription
// is active and the /webhook route mirrors state to Firestore.

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// Price IDs from the Stripe products we created. Hardcoded server-side
// so the client can't request a cheaper plan than what we sell.
const REGROWTH_PLAN_PRICES: Record<string, string> = {
  regrowth_1mo: "price_1U7GJ0Ax4l3WR2mPEWpuBgAO",
  regrowth_4mo: "price_1U7GJ1Ax4l3WR2mP3Bs2wXHX",
};

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "stripe_secret_key_not_configured" },
      { status: 500 },
    );
  }

  try {
    const { uid, email, name, planKey, existingCustomerId } =
      (await req.json()) as {
        uid?: string;
        email?: string;
        name?: string;
        planKey?: string;
        existingCustomerId?: string;
      };

    if (!uid) {
      return NextResponse.json(
        { ok: false, error: "missing_uid" },
        { status: 400 },
      );
    }
    if (!planKey || !REGROWTH_PLAN_PRICES[planKey]) {
      return NextResponse.json(
        { ok: false, error: "invalid_plan_key" },
        { status: 400 },
      );
    }
    const priceId = REGROWTH_PLAN_PRICES[planKey];

    // 1. Get-or-create Stripe customer.
    let customerId = existingCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: name || undefined,
        metadata: { uid, source: "mobile_app_regrowth_subscription" },
      });
      customerId = customer.id;
    }

    // 2. Ephemeral key for the mobile Payment Sheet.
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2023-10-16" },
    );

    // 3. Create the subscription in "incomplete" state so we can charge
    //    the first invoice via Payment Sheet on the client. Expanding
    //    latest_invoice.payment_intent gives us the client_secret to
    //    hand back to the mobile app.
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
      },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        uid,
        plan_key: planKey,
        product: "regrowth_kit_subscription",
        source: "mobile_app",
      },
    });

    const latestInvoice = subscription.latest_invoice as Stripe.Invoice | null;
    const paymentIntent =
      latestInvoice?.payment_intent as Stripe.PaymentIntent | null;

    if (!paymentIntent?.client_secret) {
      return NextResponse.json(
        { ok: false, error: "no_payment_intent_client_secret" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      customerId,
      ephemeralKey: ephemeralKey.secret,
      subscriptionId: subscription.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe/subscription/create]", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
