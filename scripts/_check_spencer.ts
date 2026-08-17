import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "spencerkrug40@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(0); }
  const d = snap.docs[0];
  const u: any = d.data();
  console.log("uid:", d.id);
  console.log("email:", u.email);
  console.log("user_type:", u.user_type);
  console.log("open_account:", u.open_account);
  console.log("start_date:", JSON.stringify(u.start_date));
  console.log("providerId:", u.providerId);
  console.log("treatment_stage:", u.treatment_stage);
  console.log("starter_photos_submitted_once:", u.starter_photos_submitted_once);
  console.log("starter_photos_submit_submitted_once:", u.starter_photos_submit_submitted_once);
  console.log("created_at:", JSON.stringify(u.created_at));
  console.log("displayName:", u.wp_user?.displayName);
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
