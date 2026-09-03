import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  const snap = await db.collection("Users").where("email", "==", "najinthant@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); return; }
  const doc = snap.docs[0];
  const d = doc.data();
  console.log(`UID: ${doc.id}`);
  console.log(`email: ${d.email}`);
  console.log(`user_type: ${d.user_type}`);
  console.log(`pro: ${d.pro}`);
  console.log(`treatment_stage: ${d.treatment_stage}`);
  console.log(`selected_gender: ${d.selected_gender}`);
  console.log(`start_date: ${JSON.stringify(d.start_date)}`);
  console.log(`created_at: ${d.created_at?.toDate?.().toISOString?.() ?? d.created_at}`);
  console.log("");
  const progress = d.progress ?? {};
  const dayKeys = Object.keys(progress).filter((k) => k.startsWith("day"));
  dayKeys.sort((a, b) => {
    const na = parseInt(a.replace("day", ""), 10);
    const nb = parseInt(b.replace("day", ""), 10);
    return na - nb;
  });
  console.log(`Total completed-day entries in progress: ${dayKeys.length}`);
  console.log(`Range: ${dayKeys[0]} → ${dayKeys[dayKeys.length - 1]}`);
  console.log("\n── Exercise counts per day ──");
  const buckets: Record<number, number> = {};
  for (const k of dayKeys) {
    const entries = progress[k] as any[];
    const n = entries.length;
    buckets[n] = (buckets[n] || 0) + 1;
  }
  console.log(`Buckets: ${JSON.stringify(buckets)}`);
  console.log(`\nFirst 5 days:`);
  for (const k of dayKeys.slice(0, 5)) {
    const entries = progress[k] as any[];
    const totalDur = entries.reduce((s, e) => s + (e.duration || 0), 0);
    console.log(`  ${k}: ${entries.length}ex ${totalDur}min ids=[${entries.map(e => e.exercise_id).join(", ")}]`);
  }
  console.log(`\nLast 5 days:`);
  for (const k of dayKeys.slice(-5)) {
    const entries = progress[k] as any[];
    const totalDur = entries.reduce((s, e) => s + (e.duration || 0), 0);
    console.log(`  ${k}: ${entries.length}ex ${totalDur}min ids=[${entries.map(e => e.exercise_id).join(", ")}]`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
