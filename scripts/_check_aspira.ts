import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "aspira9999@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(0); }
  const d = snap.docs[0];
  const u: any = d.data();
  console.log("uid:", d.id);
  console.log("email:", u.email);
  console.log("displayName:", u.wp_user?.displayName);
  console.log("user_type:", u.user_type);
  console.log("providerId:", u.providerId);
  console.log("pro:", u.pro);
  console.log("purchase_types:", JSON.stringify(u.purchase_types));
  console.log("plan:", u.plan);
  console.log("paymentProvider:", u.paymentProvider);
  console.log("stripe_customer_id:", u.stripe_customer_id);
  console.log("razorpay_subscription_id:", u.razorpay_subscription_id);
  console.log("trial_status:", u.trial_status);
  console.log("treatment_stage:", u.treatment_stage);
  console.log("created_at:", JSON.stringify(u.created_at));
  console.log("modified_at:", JSON.stringify(u.modified_at));
  console.log("start_date:", JSON.stringify(u.start_date));
  console.log("open_account:", u.open_account);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
