import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("email", "==", "hazeeqabdul2025@icloud.com").limit(1).get();
  if (snap.empty) { console.error("not found"); process.exit(1); }
  const d = snap.docs[0].data();

  const keys = [
    "email", "user_type", "selected_gender", "treatment_stage",
    "free_stoppage_switched_at_date", "free_maintenance_switched_at_date",
    "regrowth_switched_at_date", "free_stoppage_ext_switched_at_date",
    "regrowth_treatment_purchased", "regrowth_consultation_completed",
    "regrowth_consultation_completed_at", "stripe_customer_id",
    "scalp_health_support_purchased", "vip_treatment_purchased",
    "extra_user_tags", "userLocalTimeZone", "open_account",
    "start_date", "created_at", "modified_at",
    "hair_loss_stoppage_reported_at", "stabilization_confirmed",
  ];
  console.log(`\nUID: ${snap.docs[0].id}\n`);
  for (const k of keys) {
    const v = d[k];
    if (v === undefined) { console.log(`  ${k.padEnd(46)} (unset)`); continue; }
    const display = (typeof v === "object" && v !== null && (v as any).toDate)
      ? (v as any).toDate().toISOString()
      : (typeof v === "object" ? JSON.stringify(v) : String(v));
    console.log(`  ${k.padEnd(46)} ${display}`);
  }
  // Show progress / regrowth_progress sizes
  const progKeys = Object.keys(d.progress || {});
  const regKeys = Object.keys(d.regrowth_progress || {});
  console.log(`\n  progress entries:           ${progKeys.length}  (${progKeys.slice(0, 5).join(", ")}${progKeys.length > 5 ? "..." : ""})`);
  console.log(`  regrowth_progress entries:  ${regKeys.length}`);
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
