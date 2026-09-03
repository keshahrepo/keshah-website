import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const since = Timestamp.fromMillis(Date.now() - 24 * 3600 * 1000);
  const snap = await db.collection("Users")
    .where("scalp_tension_baseline_started_at", ">=", since).get();
  let baselines = 0, withReadings = 0;
  const rows: {uid:string; email:string; base:number|undefined; readings:number; latest:string|undefined}[] = [];
  for (const d of snap.docs) {
    baselines++;
    const u = d.data() as any;
    const readings = Array.isArray(u.scalp_check_readings) ? u.scalp_check_readings : [];
    if (readings.length > 0) withReadings++;
    rows.push({
      uid: d.id,
      email: u.email ?? "?",
      base: u.scalp_tension_baseline,
      readings: readings.length,
      latest: readings.length ? JSON.stringify(readings[readings.length-1]) : undefined,
    });
  }
  console.log(`Baselines started (last 24h): ${baselines}`);
  console.log(`  ...with at least one check-in reading: ${withReadings}`);
  for (const r of rows.slice(0, 8)) console.log("  ", JSON.stringify(r));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
