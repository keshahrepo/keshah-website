import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const email = "rishitarapareddy@gmail.com";

(async () => {
  // 1. Find all Firestore Users docs with this email
  const byEmail = await db.collection("Users").where("email", "==", email).get();
  console.log(`Users docs with email=${email}: ${byEmail.size}`);
  byEmail.docs.forEach((d, i) => {
    const x = d.data();
    console.log(`\n[${i}] UID: ${d.id}`);
    console.log(`    providerId:     ${x.providerId || "-"}`);
    console.log(`    user_type:      ${x.user_type || "-"}`);
    console.log(`    start_date:     ${JSON.stringify(x.start_date) || "-"}`);
    console.log(`    plan:           ${x.plan || x.razorpay_plan || "-"}`);
    console.log(`    razorpay_sub:   ${x.razorpay_subscription_id?.slice(0,20) || "-"}`);
    console.log(`    stripe_id:      ${x.stripe_customer_id || "-"}`);
    console.log(`    trial_status:   ${x.trial_status || "-"}`);
    console.log(`    paid_at:        ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`    wp_user.ID:     ${x.wp_user?.ID || "-"}`);
    console.log(`    wp_user.email:  ${x.wp_user?.user_email || "-"}`);
    console.log(`    has_password:   ${!!x.password}`);
    console.log(`    signup_source:  ${x.signup_source || "-"}`);
    console.log(`    created_at:     ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
  });

  // 2. Check wp_user.user_email too (some flows index there)
  const byWp = await db.collection("Users").where("wp_user.user_email", "==", email).get();
  if (byWp.size > byEmail.size) {
    console.log(`\nExtra docs via wp_user.user_email: ${byWp.size - byEmail.size}`);
    byWp.docs.forEach(d => {
      if (!byEmail.docs.find(b => b.id === d.id)) {
        console.log(`  different doc: ${d.id}`);
      }
    });
  }

  // 3. Firebase Auth user by email
  try {
    const authUser = await auth.getUserByEmail(email);
    console.log(`\nFirebase Auth:`);
    console.log(`  uid:        ${authUser.uid}`);
    console.log(`  providers:  ${authUser.providerData.map(p => p.providerId).join(", ") || "none"}`);
    console.log(`  created:    ${authUser.metadata.creationTime}`);
    console.log(`  last sign:  ${authUser.metadata.lastSignInTime}`);
  } catch (e: any) {
    console.log(`\nFirebase Auth: ${e.message}`);
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
