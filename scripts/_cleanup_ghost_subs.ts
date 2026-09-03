// Cancel Stripe subscriptions created by the old /trial flow that never
// had a card attached ("ghosts"). These were created upfront by the
// buggy `/api/stripe/create-subscription-intent` v1 which built the
// Subscription BEFORE the SetupIntent was confirmed. Once we switched to
// SetupIntent-first, no more ghosts will be created — this script cleans
// up the ones already in Stripe so they don't try to bill in 7 days.
//
// Filter: status=trialing, no default_payment_method, customer email
// matches placeholder pattern (pending+*@keshah.com). Anything outside
// that filter is left alone.
//
// Dry-run by default. Pass --apply to actually cancel.

import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const APPLY = process.argv.includes("--apply");

async function main() {
  const cutoff = Math.floor(Date.now() / 1000) - 48 * 3600;
  const subs = await stripe.subscriptions.list({
    created: { gte: cutoff },
    status: "trialing",
    limit: 100,
    expand: ["data.customer", "data.default_payment_method"],
  });
  console.log(
    `\n${subs.data.length} trialing subs in the past 48h (dry-run=${!APPLY})\n`,
  );

  let ghostCount = 0;
  let cancelledCount = 0;
  for (const sub of subs.data) {
    const cust = sub.customer as Stripe.Customer;
    const email =
      cust && !("deleted" in cust && cust.deleted)
        ? ((cust as Stripe.Customer).email ?? "")
        : "";
    const dpm = sub.default_payment_method as Stripe.PaymentMethod | null;
    const isPlaceholderEmail = /^pending\+\d+@keshah\.com$/.test(email);
    const noCard = dpm == null;

    if (!isPlaceholderEmail && !noCard) continue;
    if (!noCard) continue; // keep subs with a card even if email looks weird

    ghostCount++;
    const label = `${sub.id}  ${new Date(sub.created * 1000).toISOString()}  email=${email || "(none)"}`;
    if (APPLY) {
      try {
        await stripe.subscriptions.cancel(sub.id);
        cancelledCount++;
        console.log(`✓ cancelled  ${label}`);
      } catch (e) {
        console.error(
          `✗ FAILED to cancel ${sub.id}:`,
          e instanceof Error ? e.message : e,
        );
      }
    } else {
      console.log(`  would cancel  ${label}`);
    }
  }

  console.log(
    `\nGhost total: ${ghostCount}${APPLY ? `, cancelled: ${cancelledCount}` : ""}`,
  );
  if (!APPLY) console.log(`Re-run with --apply to actually cancel.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
