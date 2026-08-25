// One-off: create the Stripe Product + Price for the web trial paywall
// ($99 every 3 months USD) and register the trial-subscription webhook.
//
// Idempotent — searches for existing product/price/webhook first and reuses.
// Prints the values that need to land in Vercel env at the end.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_setup_trial_stripe_infra.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

const PRODUCT_NAME = "KESHAH Membership — 3-Month Plan";
const PRICE_AMOUNT_CENTS = 9900;
const PRICE_CURRENCY = "usd";
const PRICE_INTERVAL_COUNT = 3;
const PRICE_LOOKUP_KEY = "keshah_trial_3mo_usd";

const WEBHOOK_URL = "https://www.keshah.com/api/stripe/trial-subscription/webhook";
const WEBHOOK_EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
];

async function ensureProduct(): Promise<Stripe.Product> {
  const existing = await stripe.products.search({
    query: `active:'true' AND name:'${PRODUCT_NAME.replace(/'/g, "\\'")}'`,
    limit: 10,
  });
  if (existing.data.length > 0) {
    console.log(`▸ Product exists: ${existing.data[0].id}`);
    return existing.data[0];
  }
  const p = await stripe.products.create({
    name: PRODUCT_NAME,
    description:
      "$33/month • 3-month commitment • billed as $99 every 3 months • 7-day free trial",
    metadata: { source: "web_trial_paywall", trial_days: "7" },
  });
  console.log(`▸ Product created: ${p.id}`);
  return p;
}

async function ensurePrice(productId: string): Promise<Stripe.Price> {
  const existing = await stripe.prices.list({
    lookup_keys: [PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  if (existing.data.length > 0) {
    console.log(`▸ Price exists: ${existing.data[0].id} (lookup_key: ${PRICE_LOOKUP_KEY})`);
    return existing.data[0];
  }
  const price = await stripe.prices.create({
    product: productId,
    unit_amount: PRICE_AMOUNT_CENTS,
    currency: PRICE_CURRENCY,
    recurring: { interval: "month", interval_count: PRICE_INTERVAL_COUNT },
    lookup_key: PRICE_LOOKUP_KEY,
    metadata: { source: "web_trial_paywall" },
  });
  console.log(`▸ Price created: ${price.id}`);
  return price;
}

async function ensureWebhook(): Promise<{ id: string; secret: string | null }> {
  const list = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = list.data.find((w) => w.url === WEBHOOK_URL);
  if (match) {
    console.log(`▸ Webhook exists: ${match.id}`);
    // Ensure event list is up to date
    const needsUpdate =
      WEBHOOK_EVENTS.some((e) => !match.enabled_events.includes(e)) ||
      match.enabled_events.length !== WEBHOOK_EVENTS.length;
    if (needsUpdate) {
      await stripe.webhookEndpoints.update(match.id, {
        enabled_events: WEBHOOK_EVENTS,
      });
      console.log(`  → Events updated to: ${WEBHOOK_EVENTS.join(", ")}`);
    }
    console.log(
      `  Signing secret is NOT retrievable after creation. Fetch it from Stripe Dashboard → Developers → Webhooks → this URL → "Reveal signing secret".`,
    );
    return { id: match.id, secret: null };
  }
  const w = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: WEBHOOK_EVENTS,
    description: "Web trial paywall — seeds Firestore + mints custom token for mobile handoff",
  });
  console.log(`▸ Webhook created: ${w.id}`);
  return { id: w.id, secret: w.secret ?? null };
}

(async () => {
  console.log(`\n=== Stripe trial infra setup ===\n`);
  const product = await ensureProduct();
  const price = await ensurePrice(product.id);
  const webhook = await ensureWebhook();

  console.log(`\n=== Values to set in Vercel env ===`);
  console.log(`\n  STRIPE_TRIAL_PRICE_ID=${price.id}`);
  if (webhook.secret) {
    console.log(`  STRIPE_TRIAL_WEBHOOK_SECRET=${webhook.secret}`);
  } else {
    console.log(
      `  STRIPE_TRIAL_WEBHOOK_SECRET=<fetch manually from Stripe Dashboard>`,
    );
  }
  console.log(`\nProduct: ${product.id}`);
  console.log(`Price: ${price.id}`);
  console.log(`Webhook: ${webhook.id}`);
  process.exit(0);
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
