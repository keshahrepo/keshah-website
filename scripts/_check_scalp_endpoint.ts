import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  const snap = await db.collection("Users")
    .where("treatment_stage", "in", ["FREE_STOPPAGE", "FREE_STOPPAGE_PLUS"]).get();
  console.log("Total FREE_STOPPAGE(+) users:", snap.size);
  let withBaseline = 0, withReadings = 0;
  const recent: any[] = [];
  const from = new Date("2026-09-02T00:00:00Z").getTime();
  const to = new Date().getTime();
  for (const d of snap.docs) {
    const u:any = d.data();
    const b = u.scalp_tension_baseline;
    if (typeof b !== "number") continue;
    withBaseline++;
    const baseAtMs = u.scalp_tension_baseline_at?.toMillis?.() ?? null;
    if (Array.isArray(u.scalp_check_readings) && u.scalp_check_readings.length) withReadings++;
    if (baseAtMs != null && baseAtMs >= from && baseAtMs <= to) {
      recent.push({email: u.email, baseline: b, at: new Date(baseAtMs).toISOString(), readings: u.scalp_check_readings?.length ?? 0});
    }
  }
  console.log("With baseline set:", withBaseline);
  console.log("With ≥1 reading:", withReadings);
  console.log("Baseline_at within default endpoint window (Sep 2 - now):", recent.length);
  for (const r of recent) console.log(" ", JSON.stringify(r));
})();
