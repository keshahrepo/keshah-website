import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const collections = [
    "Exercise_List",       // VIP source
    "Free_Exercise_List",  // FreeV1 source
    "FREEV2_MEN_STOPPAGE_EXERCISES",
    "FREEV2_WOMEN_STOPPAGE_EXERCISES",
    "FREEV2_MEN_REGROWTH_EXERCISES",
    "FREEV2_MEN_MAINTENANCE_EXERCISES",
  ];
  for (const c of collections) {
    const snap = await db.collection(c).get();
    console.log(`${c}: ${snap.size} day docs`);
    if (snap.size > 0) {
      const first = snap.docs[0];
      const d = first.data();
      console.log(`  ${first.id}: ${d?.exercises?.length ?? 0} exercises`);
    }
  }

  // VIP user counts
  const vip = await db.collection("Users").where("user_type", "==", "vip").limit(5).get();
  console.log(`\nSampled ${vip.size} VIP users:`);
  for (const doc of vip.docs) {
    const d = doc.data();
    console.log(`  ${doc.id}: pro=${d.pro} treatment_stage=${d.treatment_stage} progress.day1=${(d.progress?.day1?.length ?? 0)}ex progress.day30=${(d.progress?.day30?.length ?? 0)}ex progress.day60=${(d.progress?.day60?.length ?? 0)}ex`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
