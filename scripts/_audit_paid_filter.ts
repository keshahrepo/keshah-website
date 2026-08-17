// Check how many "paidStoppage" tagged users actually have payment evidence.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const all = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total paidStoppage-tagged: ${all.length}`);

  let withRzpSub = 0;
  let withPaymentProvider = 0;
  let withRzpPlan = 0;
  let withStripeId = 0;
  let withAnyPayEvidence = 0;
  let withPaidAt = 0;

  for (const d of all) {
    const data = d.data();
    const hasRzpSub = !!data.razorpay_subscription_id;
    const hasPp = !!data.payment_provider;
    const hasRzpPlan = !!data.razorpay_plan;
    const hasStripe = !!data.stripe_customer_id;
    const hasPaidAt = !!data.paid_at;

    if (hasRzpSub) withRzpSub++;
    if (hasPp) withPaymentProvider++;
    if (hasRzpPlan) withRzpPlan++;
    if (hasStripe) withStripeId++;
    if (hasPaidAt) withPaidAt++;
    if (hasRzpSub || hasPp || hasRzpPlan) withAnyPayEvidence++;
  }

  console.log(`\nWith razorpay_subscription_id: ${withRzpSub}`);
  console.log(`With payment_provider set:     ${withPaymentProvider}`);
  console.log(`With razorpay_plan:            ${withRzpPlan}`);
  console.log(`With stripe_customer_id:       ${withStripeId}`);
  console.log(`With paid_at:                  ${withPaidAt}`);
  console.log(`With ANY pay evidence:         ${withAnyPayEvidence}`);

  // Breakdown of payment_provider values
  const pp: Record<string, number> = {};
  for (const d of all) {
    const v = d.data().payment_provider as string | undefined;
    pp[v ?? "(none)"] = (pp[v ?? "(none)"] || 0) + 1;
  }
  console.log(`\npayment_provider distribution:`);
  for (const [k, v] of Object.entries(pp).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)}: ${v}`);
  }

  // How many of the "ghost failed" (paidStoppage + 0 wk1 days + tenure>=30) actually have pay evidence?
  const now = Date.now();
  const DAY_MS = 86400000;
  let ghostsWithPay = 0;
  let ghostsTotal = 0;
  let realFailedWithPay = 0;
  for (const d of all) {
    const data = d.data();
    const progress = (data.progress ?? {}) as Record<string, unknown[]>;
    const completedDays: number[] = [];
    for (const k of Object.keys(progress)) {
      if (!k.startsWith("day")) continue;
      const n = parseInt(k.slice(3), 10);
      if (!Number.isFinite(n)) continue;
      if (Array.isArray(progress[k]) && progress[k].length > 0) completedDays.push(n);
    }
    const wk1 = completedDays.filter(d => d <= 7).length;
    const total = completedDays.length;
    const paidAtMs = data.paid_at?.toDate?.()?.getTime?.() ?? null;
    const createdAtMs = data.created_at?.toDate?.()?.getTime?.() ?? null;
    const earliest = paidAtMs ?? createdAtMs ?? null;
    const tenure = earliest ? Math.floor((now - earliest) / DAY_MS) : null;
    const hasPay = !!data.razorpay_subscription_id || !!data.payment_provider || !!data.razorpay_plan;

    if (wk1 === 0 && tenure != null && tenure >= 30) {
      ghostsTotal++;
      if (hasPay) ghostsWithPay++;
    }
    if (total < 10 && tenure != null && tenure >= 30 && hasPay) realFailedWithPay++;
  }
  console.log(`\n"Ghosts" (wk1=0, tenure>=30):       ${ghostsTotal}`);
  console.log(`  ...of which have pay evidence:    ${ghostsWithPay} (${((ghostsWithPay/ghostsTotal)*100).toFixed(1)}%)`);
  console.log(`Real FAILED (with pay evidence):    ${realFailedWithPay}`);

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
