import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "jody.dauth@gmail.com").get();
  if (snap.empty) { console.log("no user"); process.exit(1); }
  const d = snap.docs[0];
  const u:any = d.data();
  console.log("uid:", d.id, "email:", u.email);
  const keys = [
    "user_type","selected_gender","pro","start_date","created_at",
    "treatment_stage","free_stoppage_switched_at_date","free_maintenance_switched_at_date",
    "regrowth_switched_at_date","regrowth_treatment_purchased","regrowth_consultation_completed",
    "regrowth_kit_purchased","qr_scanned","scalp_health_support_purchased",
    "extra_user_tags","country_tier","install_source","referral_source",
    "regrowth_progress",
  ];
  for (const k of keys) {
    const v = u[k];
    if (v !== undefined) {
      const s = typeof v === "object" ? JSON.stringify(v).slice(0, 300) : String(v);
      console.log(`  ${k}: ${s}`);
    }
  }
})();
