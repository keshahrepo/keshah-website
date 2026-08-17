// Dump shape of a few days to figure out actual schema.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  for (const col of ["FREEV2_MEN_STOPPAGE_EXERCISES", "FREEV2_WOMEN_STOPPAGE_EXERCISES"]) {
    console.log(`\n━━━ ${col} ━━━`);
    for (const day of ["Day1", "Day3", "Day5", "Day7", "Day15"]) {
      const doc = await db.collection(col).doc(day).get();
      if (!doc.exists) {
        console.log(`${day}: (does not exist)`);
        continue;
      }
      const data = doc.data() as Record<string, unknown>;
      console.log(`${day}: keys=${Object.keys(data).join(",")}`);
      // Print exercises array if it exists
      const ex = (data.exercises as unknown[]) || (data.tasks as unknown[]) || [];
      ex.forEach((item, i) => {
        if (typeof item === "object" && item !== null) {
          const o = item as Record<string, unknown>;
          console.log(`  [${i}] id=${o.id || "-"}, name=${o.name || o.title || "-"}, type=${o.type || "-"}`);
        }
      });
    }
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
