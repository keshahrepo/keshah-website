import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const uid = "aGkPL6PypxcQBn3PDlRzQ2b2iA63";
(async () => {
  const doc = await db.collection("Users").doc(uid).get();
  console.log(`Doc Users/${uid} exists: ${doc.exists}`);
  if (doc.exists) {
    const x = doc.data()!;
    console.log(`  email:           ${x.email || "-"}`);
    console.log(`  providerId:      ${x.providerId || "-"}`);
    console.log(`  user_type:       ${x.user_type || "-"}`);
    console.log(`  start_date:      ${JSON.stringify(x.start_date) || "-"}`);
    console.log(`  trial_status:    ${x.trial_status || "-"}`);
    console.log(`  plan:            ${x.plan || x.razorpay_plan || "-"}`);
    console.log(`  razorpay_sub:    ${x.razorpay_subscription_id || "-"}`);
    console.log(`  razorpay_pay:    ${x.razorpay_payment_id || "-"}`);
    console.log(`  phone_number:    ${x.phone_number?.complete_number || "-"}`);
    console.log(`  extra_user_tags: ${JSON.stringify(x.extra_user_tags) || "-"}`);
    console.log(`  created_at:      ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`  modified_at:     ${x.modified_at?.toDate?.()?.toISOString() || "-"}`);
  }

  // Also search for ANY doc with this phone or razorpay info tied to the user
  const anyEmail = await db.collection("Users").where("wp_user.user_email", "==", "niranjantrivedi2898@gmail.com").get();
  console.log(`\nDocs with wp_user.user_email match: ${anyEmail.size}`);
  anyEmail.docs.forEach(d => console.log(`  ${d.id}`));
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
