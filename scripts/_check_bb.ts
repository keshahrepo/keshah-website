import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2023-10-16" });
(async () => {
  const sub = await stripe.subscriptions.retrieve("sub_1U96F3Ax4l3WR2mP2UBhKFvG", { expand: ["customer", "default_payment_method"] });
  const cust = sub.customer as Stripe.Customer;
  console.log(`Subscription: ${sub.id}`);
  console.log(`  status: ${sub.status}`);
  console.log(`  trial_start: ${sub.trial_start ? new Date(sub.trial_start*1000).toISOString() : "-"}`);
  console.log(`  trial_end: ${sub.trial_end ? new Date(sub.trial_end*1000).toISOString() : "-"}`);
  console.log(`  metadata:`, sub.metadata);
  console.log(`Customer: ${cust.id}`);
  console.log(`  email: ${cust.email}`);
  console.log(`  created: ${new Date(cust.created*1000).toISOString()}`);
  console.log(`  metadata:`, cust.metadata);
  const dpm = sub.default_payment_method as Stripe.PaymentMethod | null;
  if (dpm) {
    console.log(`  card: ${dpm.card?.brand} ****${dpm.card?.last4}`);
  }
  const users = await db.collection("Users").where("email", "==", cust.email).limit(3).get();
  console.log(`\nUsers by email==${cust.email}: ${users.size} docs`);
  users.forEach(d => {
    const data = d.data();
    console.log(`  UID=${d.id}  subscription_id=${data.subscription_id ?? "-"}  trial_status=${data.trial_status ?? "-"}  payment_provider=${data.payment_provider}`);
  });
  const pws = await db.collection("PaidWebSessions").doc("sub_1U96F3Ax4l3WR2mP2UBhKFvG").get();
  console.log(`\nPaidWebSessions/sub_1U96F3Ax4l3WR2mP2UBhKFvG:`);
  console.log(pws.exists ? pws.data() : "(missing)");
})().catch(e => { console.error(e); process.exit(1); });
