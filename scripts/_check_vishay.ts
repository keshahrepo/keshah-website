import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const EMAIL = "visitayaanmohan275@gmail.com";
(async () => {
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(5).get();
  console.log(`Users where email == ${EMAIL}: ${snap.size} docs`);
  for (const doc of snap.docs) {
    const d = doc.data();
    console.log(`\nUID: ${doc.id}`);
    console.log(`  user_type: ${d.user_type}`);
    console.log(`  is_deleted: ${d.is_deleted}`);
    console.log(`  open_account: ${d.open_account}`);
    console.log(`  pro: ${d.pro}`);
    console.log(`  first_time: ${d.first_time}`);
    console.log(`  providerId: ${d.providerId}`);
    console.log(`  password: ${d.password ? "(present)" : "(missing)"}`);
    console.log(`  created_at: ${d.created_at?.toDate?.().toISOString?.() ?? d.created_at}`);
    console.log(`  start_date: ${JSON.stringify(d.start_date)}`);
    console.log(`  treatment_stage: ${d.treatment_stage}`);
    console.log(`  free_stoppage_switched_at_date: ${d.free_stoppage_switched_at_date}`);
    console.log(`  extra_user_tags: ${JSON.stringify(d.extra_user_tags)}`);
    console.log(`  subscription_status: ${d.subscription_status}`);
    console.log(`  regrowth_treatment_purchased: ${d.regrowth_treatment_purchased}`);
    console.log(`  wp_user: ${JSON.stringify(d.wp_user)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
