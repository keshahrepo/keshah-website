import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "2Co3Y7wG6GUa7Zkb3QYgbpH7WGE3";

(async () => {
  await db.collection("Users").doc(UID).update({
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: "22/04/2026",
    regrowth_switched_at_day: 58,
    modified_at: FieldValue.serverTimestamp(),
  });
  console.log(`✓ ${UID} switched to REGROWTH stage`);

  const doc = await db.collection("Users").doc(UID).get();
  const x = doc.data() as any;
  console.log(`  treatment_stage:            ${x.treatment_stage}`);
  console.log(`  regrowth_switched_at_date:  ${x.regrowth_switched_at_date}`);
  console.log(`  regrowth_switched_at_day:   ${x.regrowth_switched_at_day}`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
