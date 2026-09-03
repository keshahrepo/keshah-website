import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  const snap = await db.collection("Users").where("email", "==", "jekabs.vancans@inbox.lv").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND by email"); return; }
  const doc = snap.docs[0];
  const d = doc.data();
  console.log("UID:", doc.id);
  console.log("email:", d.email);
  console.log("wp_user:", JSON.stringify(d.wp_user, null, 2));
  console.log("regrowth_treatment_purchased:", d.regrowth_treatment_purchased);
  console.log("scalp_health_support_purchased:", d.scalp_health_support_purchased);
  console.log("stripe_customer_id:", d.stripe_customer_id);
  console.log("regrowth_kit_purchase:", JSON.stringify(d.regrowth_kit_purchase, null, 2));
  console.log("delivery_address:", JSON.stringify(d.delivery_address, null, 2));
  console.log("completed_donation_amount:", d.completed_donation_amount);
  console.log("country_tier:", d.country_tier);
  console.log("userLocalTimeZone:", d.userLocalTimeZone);
  console.log("created_at:", d.created_at?.toDate?.().toISOString?.());
}
main().catch((e) => { console.error(e); process.exit(1); });
