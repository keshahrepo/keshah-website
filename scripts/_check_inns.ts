import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // Query for users who have ANY check_in_day_*_completed field
  const snap = await db.collection("Users").limit(1).get();
  // Just dump all field keys for a sample user to see what exists
  const sample = snap.docs[0]?.data();
  const fields = Object.keys(sample || {}).filter(k => k.includes("check_in") || k.includes("hair") || k.includes("stabil") || k.includes("stoppage"));
  console.log("Sample user field keys matching check_in/hair/stabil/stoppage:");
  fields.forEach(f => console.log(`  ${f}`));

  // Now count across all users for these specific fields
  const countField = async (field: string) => {
    const s = await db.collection("Users").where(field, "!=", null).count().get();
    return s.data().count;
  };

  console.log(`\nUsers with each field set:`);
  for (const field of [
    "check_in_day_60_completed",
    "check_in_day_90_completed",
    "check_in_day_30_completed",
    "check_in_day_45_completed",
    "hair_fall_check_ins",
    "stabilization_confirmed",
    "hair_loss_stoppage_reported_at",
    "hair_loss_stoppage_reported_once",
    "day60_celebration_shown",
  ]) {
    try {
      const count = await countField(field);
      console.log(`  ${field.padEnd(40)}: ${count}`);
    } catch (e: any) {
      console.log(`  ${field.padEnd(40)}: err (${e.message.slice(0, 40)})`);
    }
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
