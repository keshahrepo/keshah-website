// Find all Stripe subscriptions for aaprpa999@gmail.com and cancel them.
// Aadi has been creating trial subs during test — clean them all out.
//
// Usage: npx tsx scripts/_cancel_aaprpa999_trials.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const EMAIL = "aaprpa999@gmail.com";

async function main() {
  console.log(`\nSearching for Stripe customers with email ${EMAIL}...\n`);

  // Find all customers with this email (there may be more than one from
  // testing — Stripe creates a new customer per Checkout Session by default).
  const customers = await stripe.customers.list({ email: EMAIL, limit: 100 });
  console.log(`Found ${customers.data.length} Stripe customers.`);

  const toCancel: Array<{
    customerId: string;
    subscriptionId: string;
    status: string;
    created: string;
  }> = [];

  for (const c of customers.data) {
    const subs = await stripe.subscriptions.list({
      customer: c.id,
      status: "all",
      limit: 100,
    });
    for (const s of subs.data) {
      if (
        s.status === "trialing" ||
        s.status === "active" ||
        s.status === "past_due" ||
        s.status === "incomplete"
      ) {
        toCancel.push({
          customerId: c.id,
          subscriptionId: s.id,
          status: s.status,
          created: new Date(s.created * 1000).toISOString(),
        });
      }
    }
  }

  console.log(`\n─── Live subscriptions to cancel ───`);
  for (const s of toCancel) {
    console.log(
      `  ${s.subscriptionId} (${s.status}, created ${s.created}) — customer ${s.customerId}`,
    );
  }

  if (toCancel.length === 0) {
    console.log("Nothing live. Done.");
    return;
  }

  console.log(`\n─── Cancelling ───`);
  for (const s of toCancel) {
    try {
      const cancelled = await stripe.subscriptions.cancel(s.subscriptionId);
      console.log(
        `  ✓ ${s.subscriptionId} → status=${cancelled.status}, canceled_at=${cancelled.canceled_at}`,
      );
    } catch (err) {
      console.error(`  ✗ ${s.subscriptionId} failed:`, err);
    }
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
