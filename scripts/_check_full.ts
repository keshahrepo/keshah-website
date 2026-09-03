import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const CUTOFF_SEC = Math.floor(new Date("2026-08-27T22:00:00Z").getTime() / 1000);
const NOW = Math.floor(Date.now() / 1000);
(async () => {
  console.log(`\nSince inline flow deployed (~22:00 UTC Aug 27), ${(NOW-CUTOFF_SEC)/3600}h ago:\n`);

  // SetupIntents (new inline flow signal)
  const sis = await stripe.setupIntents.list({ created: { gte: CUTOFF_SEC }, limit: 100 });
  console.log(`SetupIntents: ${sis.data.length}`);
  const byStatus: Record<string, number> = {};
  for (const si of sis.data) byStatus[si.status] = (byStatus[si.status] ?? 0) + 1;
  for (const [s, n] of Object.entries(byStatus)) console.log(`  ${s}: ${n}`);
  
  // Subs (only created when setup succeeds now)
  const subs = await stripe.subscriptions.list({ created: { gte: CUTOFF_SEC }, limit: 50 });
  console.log(`\nNew subscriptions since inline deploy: ${subs.data.length}`);
  for (const sub of subs.data) {
    console.log(`  ${sub.id}  ${new Date(sub.created*1000).toISOString()}  status=${sub.status}`);
  }
  
  // Recent hosted Checkout sessions (should be near-zero if all traffic is on inline)
  const cs = await stripe.checkout.sessions.list({ created: { gte: CUTOFF_SEC }, limit: 50 });
  console.log(`\nHosted Checkout sessions (should be 0 if inline flow is receiving all traffic): ${cs.data.length}`);
})().catch(e => { console.error(e); process.exit(1); });
