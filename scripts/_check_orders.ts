import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  for (const c of ["Orders", "website_orders", "Pipeline"]) {
    const snap = await db.collection(c).limit(3).get();
    console.log(`\n=== ${c} (total sampled: ${snap.size}) ===`);
    if (snap.empty) { console.log("  (empty)"); continue; }
    for (const d of snap.docs) {
      const data: any = d.data();
      console.log(`  doc ${d.id}:`);
      const keys = Object.keys(data).slice(0, 12);
      for (const k of keys) {
        const v = data[k];
        const str = typeof v === 'object' ? JSON.stringify(v).slice(0,60) : String(v).slice(0,60);
        console.log(`    ${k}: ${str}`);
      }
    }
    // count total
    const total = await db.collection(c).count().get();
    console.log(`  TOTAL in ${c}: ${total.data().count}`);
  }
  process.exit(0);
})().catch((e:any)=>{console.error(e); process.exit(1);});
