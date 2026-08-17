import Razorpay from "razorpay";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

(async () => {
  const plan = await razorpay.plans.create({
    period: "weekly",
    interval: 1,
    item: {
      name: "KESHAH Weekly Premium",
      description: "KESHAH — ₹499/week",
      amount: 49900, // paise → ₹499
      currency: "INR",
    },
    notes: {
      purpose: "startindia2_v3_weekly_decoy_499",
    },
  });

  console.log("✓ Created weekly premium plan:");
  console.log(`  id:       ${plan.id}`);
  console.log(`  period:   ${plan.period}`);
  console.log(`  interval: ${plan.interval}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  console.log(`  amount:   ₹${(plan.item as any).amount / 100}`);
  console.log(`\nAdd to app/api/razorpay/create-order/route.ts:`);
  console.log(`  weeklyPremium: { planId: "${plan.id}", description: "KESHAH — ₹499/week" }`);
  process.exit(0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
})().catch((e: any) => {
  console.error("ERR:", e?.error?.description || e.message);
  console.error(JSON.stringify(e, null, 2));
  process.exit(1);
});
