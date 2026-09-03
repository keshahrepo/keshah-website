import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "test123@test.com").get();
  for (const d of snap.docs) {
    const u: any = d.data();
    console.log("uid:", d.id);
    const keys = ["email","user_type","selected_gender","pro","start_date","created_at","modified_at","paidStoppage","post_auth_flow_2_step","post_auth_flow2_step","current_active_step","first_time","scalp_tension_baseline","scalp_tension_baseline_started_at","starter_photos_submitted_once","alarm_walkthrough_seen","alarm_walkthrough_outcome","install_source","attribution_media_source","extra_user_tags","country_tier","progress","referral_source","stripe_customer_id","started_trial","converted_trial"];
    for (const k of keys) {
      const v = u[k];
      if (v !== undefined) console.log(`  ${k}:`, JSON.stringify(v));
    }
  }
})();
