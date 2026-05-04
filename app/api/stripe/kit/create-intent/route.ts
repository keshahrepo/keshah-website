// Stripe one-time PaymentIntent for the regrowth kit (US/global path).
//
// Mirrors /api/razorpay/kit/create-order: hardcodes $495 / $396 (Photo Hero)
// server-side so the client can't forge a cheaper purchase. Other Stripe
// flows (scalp_health_support, donations) keep using the existing Cloud
// Function — only kit purchases route through here.
//
// Output: clientSecret + customerId + ephemeralKey + paymentIntentId,
// matching the shape mobile's StripeCheckoutPage expects from a single
// call (consolidates create-customer + ephemeral-key + create-intent so
// the mobile flow can do one round trip instead of three).

import { NextResponse } from "next/server";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

// $495 = 49,500 cents. $396 with Photo Hero = 39,600 cents.
const KIT_AMOUNT_CENTS = 49500;
const KIT_AMOUNT_CENTS_PHOTO_HERO = 39600;
const KIT_CURRENCY = "usd";

export async function POST(req: Request) {
  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { ok: false, error: "stripe_secret_key_not_configured" },
      { status: 500 }
    );
  }

  try {
    const {
      uid,
      email,
      name,
      photoHeroOptIn,
      existingCustomerId,
    } = (await req.json()) as {
      uid?: string;
      email?: string;
      name?: string;
      photoHeroOptIn?: boolean;
      existingCustomerId?: string;
    };

    if (!uid) {
      return NextResponse.json({ ok: false, error: "missing_uid" }, { status: 400 });
    }

    const amount = photoHeroOptIn ? KIT_AMOUNT_CENTS_PHOTO_HERO : KIT_AMOUNT_CENTS;

    // 1. Get-or-create the Stripe customer.
    let customerId = existingCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        name: name || undefined,
        metadata: { uid, source: "mobile_app_kit" },
      });
      customerId = customer.id;
    }

    // 2. Ephemeral key — lets the mobile Stripe SDK attach + reuse payment
    //    methods on the customer. API version pinned to match what the
    //    mobile flutter_stripe expects.
    const ephemeralKey = await stripe.ephemeralKeys.create(
      { customer: customerId },
      { apiVersion: "2023-10-16" }
    );

    // 3. Create the payment intent for the kit.
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: KIT_CURRENCY,
      customer: customerId,
      // Apple Pay / Google Pay / Klarna / cards — all supported via the
      // payment method types automatic config.
      automatic_payment_methods: { enabled: true },
      description: photoHeroOptIn
        ? "KESHAH Regrowth Kit (Photo Hero — 20% off)"
        : "KESHAH Regrowth Kit",
      metadata: {
        uid,
        product: "regrowth_kit",
        photo_hero: photoHeroOptIn ? "true" : "false",
        source: "mobile_app",
      },
    });

    return NextResponse.json({
      ok: true,
      clientSecret: paymentIntent.client_secret,
      customerId,
      ephemeralKey: ephemeralKey.secret,
      paymentIntentId: paymentIntent.id,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY ?? null,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[stripe/kit/create-intent]", err);
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "object" && err !== null
          ? JSON.stringify(err)
          : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
