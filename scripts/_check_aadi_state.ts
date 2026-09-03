import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import Stripe from "stripe";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2023-10-16",
});

const EMAIL = "aaditya.agrawal36@gmail.com";

async function main() {
  console.log(`\n=== Checking ${EMAIL} ===\n`);

  // Stripe subs
  const custs = await stripe.customers.list({ email: EMAIL, limit: 20 });
  const activeSubs: Array<{ id: string; status: string; created: string; success_url?: string }> = [];
  for (const c of custs.data) {
    const subs = await stripe.subscriptions.list({ customer: c.id, status: "all", limit: 20 });
    for (const s of subs.data) {
      if (["trialing", "active", "past_due"].includes(s.status)) {
        activeSubs.push({
          id: s.id,
          status: s.status,
          created: new Date(s.created * 1000).toISOString(),
        });
      }
    }
  }
  console.log(`Stripe active/trialing subs: ${activeSubs.length}`);
  activeSubs.forEach((s) => console.log(`  ${s.id}  ${s.status}  created ${s.created}`));

  // Most recent checkout session
  const sessions = await stripe.checkout.sessions.list({ limit: 20 });
  const mine = sessions.data.filter((s) => s.customer_details?.email === EMAIL);
  console.log(`\nRecent Checkout Sessions (last 20 across account, matching email): ${mine.length}`);
  mine.slice(0, 3).forEach((s) => {
    console.log(`  ${s.id}  status=${s.status}  success_url=${s.success_url}`);
    console.log(`    created ${new Date(s.created * 1000).toISOString()}  subscription=${s.subscription}`);
  });

  // PaidWebSessions
  const pws = await db.collection("PaidWebSessions").where("email", "==", EMAIL).get();
  console.log(`\nPaidWebSessions: ${pws.size}`);
  pws.forEach((d) => {
    const data = d.data();
    console.log(`  ${d.id}`);
    console.log(`    sub=${data.subscription_id}  claimed_by_uid=${data.claimed_by_uid}  created=${data.created_at?.toDate?.().toISOString()}`);
  });

  // Firestore Users
  const users = await db.collection("Users").where("email", "==", EMAIL).get();
  console.log(`\nUsers docs by email: ${users.size}`);
  users.forEach((d) => console.log(`  ${d.id}`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
