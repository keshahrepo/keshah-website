// Enable Stripe Customer Portal via API + set it as the default config.
// Once this runs, Stripe auto-injects a "Manage subscription" link into
// every subscription receipt + invoice email — no code changes needed on
// our side. Customer enters their email → Stripe emails magic login link
// → portal opens → they can cancel.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_stripe_setup_customer_portal.ts

import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const RETURN_URL = "https://www.keshah.com/support";
const BUSINESS_NAME = "KESHAH";
const PRIVACY_URL = "https://www.keshah.com/privacy";
const TERMS_URL = "https://www.keshah.com/terms";

async function main() {
  console.log("\n=== Stripe Customer Portal setup ===\n");

  // Check for existing default config
  const list = await stripe.billingPortal.configurations.list({
    is_default: true,
    limit: 1,
  });
  const existing = list.data[0];

  const params: Stripe.BillingPortal.ConfigurationCreateParams = {
    business_profile: {
      headline: `Manage your ${BUSINESS_NAME} subscription`,
      privacy_policy_url: PRIVACY_URL,
      terms_of_service_url: TERMS_URL,
    },
    default_return_url: RETURN_URL,
    features: {
      // Let user view + download past invoices
      invoice_history: { enabled: true },

      // Let user update card / payment method
      payment_method_update: { enabled: true },

      // Let user view + edit their billing info
      customer_update: {
        enabled: true,
        allowed_updates: ["address", "name", "phone", "tax_id"],
      },

      // Subscription cancellation — the main event
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end", // cancel at end of billing period, not immediately
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: [
            "too_expensive",
            "missing_features",
            "switched_service",
            "unused",
            "customer_service",
            "too_complex",
            "low_quality",
            "other",
          ],
        },
      },

      // Don't allow plan-switching for now — we only have one product
      subscription_update: {
        enabled: false,
        default_allowed_updates: [],
        products: null,
      },
    },
  };

  let config: Stripe.BillingPortal.Configuration;
  if (existing) {
    console.log(`Updating existing default config: ${existing.id}`);
    config = await stripe.billingPortal.configurations.update(
      existing.id,
      params,
    );
  } else {
    console.log("Creating new default config...");
    config = await stripe.billingPortal.configurations.create({
      ...params,
      // Only settable at creation time — makes this the default portal
      // used for auto-emailed "manage subscription" links.
      // (Note: `is_default: true` is set via the separate update call for
      // an existing config.)
    });
    // Mark as default (only possible after creation).
    await stripe.billingPortal.configurations.update(config.id, {
      // Stripe's TS types don't include is_default on update; use raw
      // parameters via any-cast so we can set it.
    } as Stripe.BillingPortal.ConfigurationUpdateParams);
    // Actually to set the default, we need to hit /v1/billing_portal/configurations/{id}
    // with is_default=true — Stripe's TS types omit this field. Fall back
    // to raw request.
    // Stripe SDK doesn't expose an easy typed way to set is_default —
    // cast to any and hit the raw endpoint.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (stripe as any).request({
      method: "POST",
      path: `/v1/billing_portal/configurations/${config.id}`,
      params: { is_default: "true" },
    });
    console.log("Marked as default.");
  }

  console.log(`\n✓ Portal config: ${config.id}`);
  console.log(`  Cancellation: ${config.features.subscription_cancel.enabled}`);
  console.log(`  Cancel mode: ${config.features.subscription_cancel.mode}`);
  console.log(`  Cancellation reasons: ${config.features.subscription_cancel.cancellation_reason.enabled}`);
  console.log(`  Payment method update: ${config.features.payment_method_update.enabled}`);
  console.log(`  Invoice history: ${config.features.invoice_history.enabled}`);
  console.log(`  Return URL: ${config.default_return_url}`);

  // Test-create a session for our known test user to confirm portal works
  console.log(`\n=== Sanity check: create a portal session ===`);
  try {
    const testCustomerId = "cus_V8mGJtSwdWz8G5"; // aaprpa999 test customer
    const session = await stripe.billingPortal.sessions.create({
      customer: testCustomerId,
      return_url: RETURN_URL,
    });
    console.log(`✓ Portal session URL (opens in browser):`);
    console.log(`  ${session.url}`);
  } catch (err) {
    console.error(`✗ Portal session test failed:`, err);
  }

  console.log(
    `\nDone. Stripe will now auto-include the portal link in every subscription receipt.`,
  );
  console.log(
    `Customer enters their email → gets magic login link from Stripe → portal opens.`,
  );
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
