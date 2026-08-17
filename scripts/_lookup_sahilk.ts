import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const email = "sahilk31@gmail.com";

(async () => {
  const snap = await db.collection("Users").where("email", "==", email).get();
  console.log(`Users docs with email=${email}: ${snap.size}`);
  snap.docs.forEach((d, i) => {
    const x = d.data();
    console.log(`\n[${i}] UID: ${d.id}`);
    console.log(`    displayName:            ${x.wp_user?.displayName || x.wp_user?.display_name || "-"}`);
    console.log(`    providerId:             ${x.providerId || "-"}`);
    console.log(`    user_type:              ${x.user_type || "-"}`);
    console.log(`    razorpay_subscription:  ${x.razorpay_subscription_id || "-"}`);
    console.log(`    razorpay_plan:          ${x.razorpay_plan || "-"}`);
    console.log(`    stripe_customer:        ${x.stripe_customer_id || "-"}`);
    console.log(`    original_app_user_id:   ${x.original_app_user_id || d.id}`);
    console.log(`    converted_at:           ${x.converted_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`    subscription_status:    ${x.subscription_status || "-"}`);
    console.log(`    created_at:             ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
  });
  process.exit(0);
})();
