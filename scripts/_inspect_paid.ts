import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  // Sample fields across recent docs. Look for any field that hints at
  // paid state.
  const snap = await db.collection("Users").limit(20).get();
  const fieldCount: Record<string, number> = {};
  for (const d of snap.docs) {
    for (const k of Object.keys(d.data())) fieldCount[k] = (fieldCount[k] || 0) + 1;
  }
  const interesting = Object.keys(fieldCount).filter(k =>
    /pro|paid|paywall|purchase|subscription|trial|plan|razorpay|stripe|entitle|rc_|payment/i.test(k)
  );
  console.log("Paid-related fields seen across 20 sample docs:");
  for (const k of interesting.sort()) console.log(`  ${k}: ${fieldCount[k]}/20`);
  console.log("");

  // Now count active subscribers in last 20 days via multiple indicators
  const cutoff = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const recent = await db.collection("Users").where("created_at", ">=", cutoff).get();
  let proTrue = 0, planSet = 0, rzpSub = 0, purchaseTypes = 0, trialActive = 0, stripeCustId = 0;
  for (const d of recent.docs) {
    const u: any = d.data();
    if (u.pro === true) proTrue++;
    if (u.plan) planSet++;
    if (u.razorpay_subscription_id) rzpSub++;
    if (u.purchase_types && Object.keys(u.purchase_types).length > 0) purchaseTypes++;
    if (u.trial_status === 'active') trialActive++;
    if (u.stripe_customer_id) stripeCustId++;
  }
  console.log(`Among ${recent.size} signups in last 20 days:`);
  console.log(`  pro===true:             ${proTrue}`);
  console.log(`  plan field set:         ${planSet}`);
  console.log(`  razorpay_subscription:  ${rzpSub}`);
  console.log(`  purchase_types non-empty:${purchaseTypes}`);
  console.log(`  trial_status===active:  ${trialActive}`);
  console.log(`  stripe_customer_id:     ${stripeCustId}`);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
