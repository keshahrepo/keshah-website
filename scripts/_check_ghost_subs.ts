import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
(async () => {
  // Look at all subs since /trial went live (past 6 hours)
  const cutoff = Math.floor(Date.now() / 1000) - 6*3600;
  const subs = await stripe.subscriptions.list({
    created: { gte: cutoff },
    limit: 50,
    expand: ["data.customer", "data.default_payment_method", "data.pending_setup_intent"],
  });
  console.log(`\nSubscriptions in past 6h: ${subs.data.length}\n`);
  for (const sub of subs.data) {
    const created = new Date(sub.created*1000).toISOString();
    const cust = sub.customer as Stripe.Customer;
    const email = cust && !("deleted" in cust && cust.deleted) ? (cust as Stripe.Customer).email : "-";
    const dpm = sub.default_payment_method as Stripe.PaymentMethod | null;
    const psi = sub.pending_setup_intent as Stripe.SetupIntent | null;
    const cardStatus = dpm ? `card=${dpm.card?.brand}****${dpm.card?.last4}` : "NO_CARD";
    const psiStatus = psi ? `psi=${psi.status}` : "no_psi";
    console.log(`${sub.id}  ${created}  status=${sub.status.padEnd(10)}  ${cardStatus.padEnd(22)}  ${psiStatus.padEnd(20)}  email=${email}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
