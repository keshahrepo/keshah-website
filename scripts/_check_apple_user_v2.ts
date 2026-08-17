import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "zf9s8wy469@privaterelay.appleid.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(0); }
  const d = snap.docs[0];
  const u: any = d.data();
  console.log("=== ONBOARDING SIGNALS ===");
  console.log("starter_photos_submit_submitted_once:", u.starter_photos_submit_submitted_once);
  console.log("first_time:", u.first_time);
  console.log("quiz_answers:", u.quiz_answers);
  console.log("hair_loss_location:", u.hair_loss_location);
  console.log("treatments_tried:", u.treatments_tried);
  console.log("hair_goal:", u.hair_goal);
  console.log("commitment_answer:", u.commitment_answer);
  console.log("activeRoutineDayEnd:", u.activeRoutineDayEnd);
  console.log("routineDayEnd:", u.routineDayEnd);
  console.log("extra_user_tags:", u.extra_user_tags);
  console.log("");
  console.log("=== DATES ===");
  console.log("created_at:", new Date((u.created_at?._seconds || 0) * 1000).toISOString());
  console.log("modified_at:", new Date((u.modified_at?._seconds || 0) * 1000).toISOString());
  console.log("start_date:", JSON.stringify(u.start_date));
  console.log("");
  console.log("=== ACCESS / PURCHASE ===");
  console.log("pro:", u.pro);
  console.log("open_account:", u.open_account);
  console.log("stripe_customer_id:", u.stripe_customer_id);
  console.log("scalp_health_support_purchased:", u.scalp_health_support_purchased);
  console.log("regrowth_treatment_purchased:", u.regrowth_treatment_purchased);
  console.log("");
  console.log("=== PROGRESS ===");
  const progressKeys = Object.keys(u.progress || {});
  console.log("progress keys:", progressKeys);
  if (progressKeys.length > 0) {
    console.log("day1 sample:", JSON.stringify(u.progress[progressKeys[0]]).slice(0, 300));
  }
  console.log("");
  console.log("=== ALL TOP-LEVEL KEYS ===");
  console.log(Object.keys(u).sort().join("\n"));
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
