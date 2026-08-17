import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "pontiacgto202@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(0); }
  const d = snap.docs[0];
  const u: any = d.data();
  console.log("uid:", d.id);
  console.log("user_type:", u.user_type);
  console.log("selected_gender:", u.selected_gender);
  console.log("treatment_stage:", u.treatment_stage);
  console.log("open_account:", u.open_account);
  console.log("start_date:", JSON.stringify(u.start_date));
  console.log("free_stoppage_switched_at_date:", u.free_stoppage_switched_at_date);
  console.log("free_maintenance_switched_at_date:", u.free_maintenance_switched_at_date);
  console.log("free_stoppage_ext_switched_at_date:", u.free_stoppage_ext_switched_at_date);
  console.log("hair_loss_stoppage_reported_at:", u.hair_loss_stoppage_reported_at);
  console.log("paid: pro=", u.pro, " purchase_types=", u.purchase_types);
  console.log("created_at:", JSON.stringify(u.created_at));
  console.log("modified_at:", JSON.stringify(u.modified_at));
  console.log("user_local_time_zone:", u.user_local_time_zone);
  // Check progress
  const progressKeys = Object.keys(u.progress || {});
  console.log("progress keys (sample):", progressKeys.slice(-5).join(", "), "/ total:", progressKeys.length);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
