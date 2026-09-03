import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");

async function main() {
  console.log("── Firestore search by name in wp_user ──");
  const snap = await db.collection("Users").where("wp_user.displayName", "==", "Jekabs Vancans").limit(3).get();
  console.log(`  wp_user.displayName exact: ${snap.size}`);
  for (const d of snap.docs) console.log("    UID:", d.id, "email:", d.data().email);

  console.log("\n── Stripe customer search by email ──");
  const cust = await stripe.customers.list({ email: "jekabs.vancans@inbox.lv", limit: 5 });
  for (const c of cust.data) {
    console.log(`  cust ${c.id}  email=${c.email}  name=${c.name}  created=${new Date(c.created*1000).toISOString()}`);
  }

  console.log("\n── Stripe search API on email ──");
  const search = await stripe.customers.search({ query: `email:'jekabs.vancans@inbox.lv'`, limit: 5 });
  for (const c of search.data) {
    console.log(`  cust ${c.id}  email=${c.email}  name=${c.name}`);
  }

  console.log("\n── Stripe charges for these customers ──");
  const allCust = [...cust.data, ...search.data.filter(s => !cust.data.some(c => c.id === s.id))];
  for (const c of allCust) {
    const charges = await stripe.charges.list({ customer: c.id, limit: 10 });
    for (const ch of charges.data) {
      console.log(`  charge ${ch.id}  ${(ch.amount/100).toFixed(2)} ${ch.currency}  status=${ch.status}  paid=${ch.paid}  created=${new Date(ch.created*1000).toISOString()}  desc=${ch.description}`);
    }
  }

  console.log("\n── Also try direct charge search by receipt email ──");
  const chargeSearch = await stripe.charges.search({ query: `receipt_email:'jekabs.vancans@inbox.lv'`, limit: 5 });
  for (const ch of chargeSearch.data) {
    console.log(`  charge ${ch.id}  ${(ch.amount/100).toFixed(2)} ${ch.currency}  status=${ch.status}  customer=${ch.customer}  billing.name=${ch.billing_details?.name}  metadata=${JSON.stringify(ch.metadata)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
