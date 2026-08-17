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
      name: "KESHAH Weekly",
      description: "KESHAH — ₹250/week",
      amount: 25000, // paise → ₹250
      currency: "INR",
    },
    notes: {
      purpose: "startindia2_weekly_decoy",
    },
  });

  console.log("✓ Created weekly plan:");
  console.log(`  id:       ${plan.id}`);
  console.log(`  period:   ${plan.period}`);
  console.log(`  interval: ${plan.interval}`);
  console.log(`  amount:   ₹${(plan.item as any).amount / 100}`);
  console.log(`\nAdd to app/api/razorpay/create-order/route.ts:`);
  console.log(`  weekly: { planId: "${plan.id}", description: "KESHAH — ₹250/week" }`);
  process.exit(0);
})().catch((e: any) => {
  console.error("ERR:", e?.error?.description || e.message);
  console.error(JSON.stringify(e, null, 2));
  process.exit(1);
});
