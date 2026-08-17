import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  for (const col of ["FREEV2_MEN_STOPPAGE_EXERCISES"]) {
    for (const day of ["Day1", "Day5", "Day7", "Day15"]) {
      const doc = await db.collection(col).doc(day).get();
      if (!doc.exists) continue;
      console.log(`\n━━━ ${col}/${day} ━━━`);
      console.log(JSON.stringify(doc.data(), null, 2));
    }
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
