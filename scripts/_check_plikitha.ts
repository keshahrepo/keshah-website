import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "plikitha546@gmail.com";

(async () => {
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(5).get();
  console.log(`Users where email == ${EMAIL}: ${snap.size} docs`);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`\nUID: ${doc.id}`);
    console.log(`  user_type: ${d.user_type}`);
    console.log(`  created_at: ${d.created_at?.toDate?.().toISOString?.() ?? d.created_at}`);
    console.log(`  payment_provider: ${d.payment_provider}`);
    console.log(`  signup_source: ${d.signup_source}`);
    console.log(`  trial_started_at: ${d.trial_started_at?.toDate?.().toISOString?.() ?? d.trial_started_at}`);
    console.log(`  first_name: ${d.first_name}`);
    console.log(`  selected_gender: ${d.selected_gender}`);
    console.log(`  user_local_time_zone: ${d.user_local_time_zone}`);
    console.log(`  stripe_customer_id: ${d.stripe_customer_id}`);
    console.log(`  subscription_id: ${d.subscription_id}`);
  }

  // Also check PaidWebSessions
  const pws = await db.collection("PaidWebSessions").where("email", "==", EMAIL).limit(5).get();
  console.log(`\nPaidWebSessions where email == ${EMAIL}: ${pws.size} docs`);
  for (const doc of pws.docs) {
    const d = doc.data();
    console.log(`  session_id: ${doc.id}  claimed_by_uid: ${d.claimed_by_uid ?? "-"}  created: ${d.created_at?.toDate?.().toISOString?.() ?? "-"}`);
  }
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
