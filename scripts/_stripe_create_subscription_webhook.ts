// One-off: create (or find) the Stripe webhook endpoint that mirrors
// regrowth-subscription events into Firestore.
//
// Idempotent — searches for an existing webhook with the same URL first.
// Prints the signing secret at the end so it can be added to Vercel env
// as STRIPE_SUBSCRIPTION_WEBHOOK_SECRET.
//
// Usage: npx tsx scripts/_stripe_create_subscription_webhook.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20" as any,
});

const WEBHOOK_URL = "https://www.keshah.com/api/stripe/subscription/webhook";
const EVENTS: Stripe.WebhookEndpointCreateParams.EnabledEvent[] = [
  "invoice.paid",
  "customer.subscription.deleted",
  "customer.subscription.updated",
];

async function main() {
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  const match = existing.data.find((w) => w.url === WEBHOOK_URL);

  let endpoint: Stripe.WebhookEndpoint;
  let secret: string | null = null;

  if (match) {
    console.log(`\nWebhook exists: ${match.id}`);
    console.log(`  URL:    ${match.url}`);
    console.log(`  Events: ${match.enabled_events.join(", ")}`);
    // Ensure the event list is up to date.
    const needsUpdate =
      EVENTS.some((e) => !match.enabled_events.includes(e)) ||
      match.enabled_events.length !== EVENTS.length;
    if (needsUpdate) {
      endpoint = await stripe.webhookEndpoints.update(match.id, {
        enabled_events: EVENTS,
      });
      console.log(`  → Events updated to: ${endpoint.enabled_events.join(", ")}`);
    } else {
      endpoint = match;
    }
    console.log(
      `\n  Signing secret is NOT retrievable via the API after creation.`,
    );
    console.log(
      `  Fetch it manually: Stripe dashboard → Developers → Webhooks →`,
    );
    console.log(`  ${WEBHOOK_URL} → "Reveal" signing secret.`);
    console.log(`  Then add it to Vercel env as STRIPE_SUBSCRIPTION_WEBHOOK_SECRET.`);
    return;
  }

  endpoint = await stripe.webhookEndpoints.create({
    url: WEBHOOK_URL,
    enabled_events: EVENTS,
    description: "Regrowth subscription lifecycle → Firestore",
  });
  secret = endpoint.secret ?? null;

  console.log(`\nWebhook created: ${endpoint.id}`);
  console.log(`  URL:    ${endpoint.url}`);
  console.log(`  Events: ${endpoint.enabled_events.join(", ")}`);
  console.log(
    `\n  Signing secret (ONLY shown once — copy immediately):`,
  );
  console.log(`  ${secret}`);
  console.log(
    `\n  Adding to Vercel prod env as STRIPE_SUBSCRIPTION_WEBHOOK_SECRET now…`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
