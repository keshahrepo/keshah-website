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

const CUTOFF = new Date("2026-08-26T20:15:00Z");
const CUTOFF_SEC = Math.floor(CUTOFF.getTime() / 1000);

async function main() {
  console.log(`\nSince ${CUTOFF.toISOString()} (ads launch)\n`);

  // Stripe checkouts + subscriptions that completed
  const sessions = await stripe.checkout.sessions.list({
    created: { gte: CUTOFF_SEC },
    limit: 100,
  });
  const completed = sessions.data.filter((s) => s.status === "complete");
  console.log(`Completed Stripe checkout sessions: ${completed.length}`);
  for (const s of completed) {
    const created = new Date(s.created * 1000).toISOString();
    const email = s.customer_details?.email ?? "-";
    console.log(`  ${s.id.slice(0, 20)}  ${created}  ${email}  sub=${s.subscription}`);
  }

  // Also list all subscriptions (in case a new one came from Elements, not Checkout)
  const subs = await stripe.subscriptions.list({
    created: { gte: CUTOFF_SEC },
    limit: 100,
    expand: ["data.customer"],
  });
  console.log(`\nAll subscriptions since cutoff: ${subs.data.length}`);
  for (const sub of subs.data) {
    const created = new Date(sub.created * 1000).toISOString();
    const customer = sub.customer as Stripe.Customer | Stripe.DeletedCustomer;
    const email =
      customer && !("deleted" in customer && customer.deleted)
        ? (customer as Stripe.Customer).email ?? "-"
        : "-";
    const source = sub.metadata?.source ?? "-";
    console.log(
      `  ${sub.id}  ${created}  status=${sub.status.padEnd(10)}  email=${email}  source=${source}`,
    );
  }

  // PaidWebSessions since cutoff
  console.log(`\nPaidWebSessions since cutoff:`);
  const pws = await db
    .collection("PaidWebSessions")
    .where("created_at", ">=", CUTOFF)
    .get();
  console.log(`  ${pws.size} docs`);
  for (const doc of pws.docs) {
    const d = doc.data();
    console.log(
      `  ${doc.id.slice(0, 30)}  email=${d.email ?? "-"}  sub=${d.subscription_id}  claimed_by=${d.claimed_by_uid ?? "-"}`,
    );
  }

  // Users with payment_provider=stripe since cutoff
  console.log(`\nUsers with payment_provider=stripe since cutoff:`);
  const users = await db
    .collection("Users")
    .where("payment_provider", "==", "stripe")
    .where("created_at", ">=", CUTOFF)
    .get();
  console.log(`  ${users.size} docs`);
  for (const doc of users.docs) {
    const d = doc.data();
    console.log(
      `  UID=${doc.id}  email=${d.email ?? "-"}  subscription_id=${d.subscription_id ?? "-"}  trial_status=${d.trial_status ?? "-"}`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
