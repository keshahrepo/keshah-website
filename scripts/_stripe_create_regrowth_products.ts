// One-off: create the two Regrowth Kit subscription products in Stripe.
// Idempotent-ish — checks for existing products by name before creating.
//
// Usage: npx tsx scripts/_stripe_create_regrowth_products.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

interface PlanSpec {
  productName: string;
  productDescription: string;
  amountCents: number;    // USD in cents
  intervalCount: number;  // interval = "month"
  metadataKey: string;    // used in metadata + logged for reference
}

const PLANS: PlanSpec[] = [
  {
    productName: "Regrowth Kit — Monthly",
    productDescription:
      "KESHAH Regrowth Kit + protocol access, billed monthly. Cancel anytime.",
    amountCents: 19900,
    intervalCount: 1,
    metadataKey: "regrowth_1mo",
  },
  {
    productName: "Regrowth Kit — 4-Month Plan",
    productDescription:
      "KESHAH Regrowth Kit + protocol access, billed every 4 months ($99/mo effective). Cancel anytime.",
    amountCents: 39600,
    intervalCount: 4,
    metadataKey: "regrowth_4mo",
  },
];

async function main() {
  console.log("");
  for (const plan of PLANS) {
    console.log(`── ${plan.productName} ──`);

    // Find existing product with the same metadata key (safer than name).
    const existing = await stripe.products.search({
      query: `metadata['regrowth_plan_key']:'${plan.metadataKey}'`,
    });

    let productId: string;
    if (existing.data.length > 0) {
      productId = existing.data[0].id;
      console.log(`  product exists: ${productId}`);
    } else {
      const product = await stripe.products.create({
        name: plan.productName,
        description: plan.productDescription,
        shippable: true,   // physical kit
        metadata: { regrowth_plan_key: plan.metadataKey },
      });
      productId = product.id;
      console.log(`  product created: ${productId}`);
    }

    // Check for existing recurring price on this product with matching config.
    const prices = await stripe.prices.list({ product: productId, active: true, limit: 20 });
    const matching = prices.data.find((p) =>
      p.unit_amount === plan.amountCents &&
      p.recurring?.interval === "month" &&
      p.recurring?.interval_count === plan.intervalCount &&
      p.currency === "usd",
    );

    let priceId: string;
    if (matching) {
      priceId = matching.id;
      console.log(`  price exists:   ${priceId}`);
    } else {
      const price = await stripe.prices.create({
        product: productId,
        currency: "usd",
        unit_amount: plan.amountCents,
        recurring: {
          interval: "month",
          interval_count: plan.intervalCount,
        },
        metadata: { regrowth_plan_key: plan.metadataKey },
      });
      priceId = price.id;
      console.log(`  price created:  ${priceId}`);
    }

    console.log(`  → Use in code: '${priceId}'  (${plan.metadataKey})`);
    console.log("");
  }

  console.log("Done. Copy the price IDs above into the mobile app config.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
