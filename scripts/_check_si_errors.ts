import Stripe from "stripe";
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
const CUTOFF_SEC = Math.floor(new Date("2026-08-27T22:00:00Z").getTime() / 1000);
(async () => {
  const sis = await stripe.setupIntents.list({ created: { gte: CUTOFF_SEC }, limit: 100 });
  console.log(`\n${sis.data.length} SetupIntents since inline deploy\n`);

  let attempted = 0, neverAttempted = 0;
  const errorsSeen: string[] = [];
  for (const si of sis.data) {
    const err = si.last_setup_error;
    if (err) {
      attempted++;
      errorsSeen.push(`${si.id}  code=${err.code ?? "-"}  type=${err.type ?? "-"}  message="${err.message ?? "-"}"`);
    } else {
      neverAttempted++;
    }
  }
  console.log(`Attempted submit (has last_setup_error): ${attempted}`);
  console.log(`Never attempted submit (no error): ${neverAttempted}`);
  if (errorsSeen.length > 0) {
    console.log(`\nErrors:`);
    for (const e of errorsSeen.slice(0, 20)) console.log(`  ${e}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
