import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "KPkfKuxFw6cGpv6x8NOsgygJKrd2";
const TODAY = "2026-08-30";
(async () => {
  await db.collection("Users").doc(UID).set({
    start_date: { date: TODAY, time: "12:00" },
    free_stoppage_switched_at_date: TODAY,
    starter_photos_submitted_once: true,
    modified_at: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(`✓ patched Users/${UID}`);
  const doc = await db.collection("Users").doc(UID).get();
  const d = doc.data() ?? {};
  console.log(`  start_date: ${JSON.stringify(d.start_date)}`);
  console.log(`  free_stoppage_switched_at_date: ${d.free_stoppage_switched_at_date}`);
  console.log(`  starter_photos_submitted_once: ${d.starter_photos_submitted_once}`);
})().catch(e => { console.error(e); process.exit(1); });
