import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users").where("email", "==", "visitayaanmohan275@gmail.com").get();
  console.log("Docs found:", snap.size);
  for (const d of snap.docs) {
    const u: any = d.data();
    console.log("\nuid:", d.id);
    const keys = [
      "email","user_type","selected_gender","pro","start_date","created_at","modified_at",
      "treatment_stage","free_stoppage_switched_at_date","free_maintenance_switched_at_date",
      "regrowth_switched_at_date","free_stoppage_ext_switched_at_date",
      "hair_loss_stoppage_reported_at","paidStoppage","extra_user_tags","country_tier",
      "install_source","attribution_media_source","referral_source",
      "starter_photos_submitted_once","starterPhotosShowedOnce",
      "keshah_alarm_walkthrough_seen","alarm_walkthrough_outcome",
      "scalp_tension_baseline","scalp_tension_baseline_at","scalp_check_readings",
      "user_local_time_zone","first_time","is_deleted",
      "wp_user","providerId","open_account",
    ];
    for (const k of keys) {
      const v = u[k];
      if (v !== undefined) {
        const s = typeof v === "object" ? JSON.stringify(v).slice(0, 200) : String(v);
        console.log(`  ${k}: ${s}`);
      }
    }
    if (u.progress) {
      const days = Object.keys(u.progress);
      console.log(`  progress days: [${days.join(", ")}]  (${days.length})`);
      if (u.progress.day1) console.log(`    day1 count: ${Array.isArray(u.progress.day1) ? u.progress.day1.length : "not array"}`);
    }
  }
})();
