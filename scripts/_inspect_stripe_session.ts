import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

async function main() {
  // Most recent open session
  const list = await stripe.checkout.sessions.list({ limit: 3 });
  for (const s of list.data) {
    const full = await stripe.checkout.sessions.retrieve(s.id, {
      expand: ["line_items", "line_items.data.price", "subscription", "customer"],
    });
    console.log(`\n=== ${full.id} ===`);
    console.log(`created:        ${new Date(full.created * 1000).toISOString()}`);
    console.log(`status:         ${full.status}`);
    console.log(`payment_status: ${full.payment_status}`);
    console.log(`mode:           ${full.mode}`);
    console.log(`amount_total:   ${full.amount_total} ${full.currency}`);
    console.log(`url:            ${full.url}`);
    console.log(`success_url:    ${full.success_url}`);
    console.log(`cancel_url:     ${full.cancel_url}`);
    console.log(`customer_email: ${full.customer_email ?? "-"}`);
    console.log(`customer_details.email: ${full.customer_details?.email ?? "-"}`);
    console.log(`payment_method_collection: ${full.payment_method_collection}`);
    console.log(`payment_method_types: ${(full.payment_method_types ?? []).join(",")}`);
    console.log(`allow_promotion_codes: ${full.allow_promotion_codes}`);
    console.log(`automatic_tax:  ${JSON.stringify(full.automatic_tax)}`);
    console.log(`subscription_data.trial_period_days: ${full.subscription_data?.trial_period_days}`);
    console.log(`line_items:`);
    for (const li of full.line_items?.data ?? []) {
      const price = li.price as Stripe.Price | null;
      console.log(`  quantity=${li.quantity}  amount=${li.amount_total} ${li.currency}  price=${price?.id}  recurring=${JSON.stringify(price?.recurring)}  active=${price?.active}`);
    }
    console.log(`metadata:`);
    for (const [k, v] of Object.entries(full.metadata ?? {})) {
      console.log(`  ${k}: ${v}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
