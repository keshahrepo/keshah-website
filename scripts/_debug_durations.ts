import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // Compare the scalp_sliding model in stoppage vs maintenance
  const stopModel = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").where("id", "==", "scalp_sliding_06").get();
  const maintModel = await db.collection("FREEV2_MEN_MAINTENANCE_EXERCISES_MODEL").where("id", "==", "scalp_sliding_06").get();

  console.log(`Stoppage model for scalp_sliding_06:`);
  for (const d of stopModel.docs) {
    const data = d.data();
    console.log(`  name: ${data.name}`);
    console.log(`  videos: ${(data.videos || []).map((v: any) => `duration=${v.duration}`).join(", ")}`);
  }

  console.log(`\nMaintenance model for scalp_sliding_06:`);
  for (const d of maintModel.docs) {
    const data = d.data();
    console.log(`  name: ${data.name}`);
    console.log(`  videos: ${(data.videos || []).map((v: any) => `duration=${v.duration}`).join(", ")}`);
  }

  // And compare all models — for each exercise ID, what durations exist in each collection?
  console.log(`\n\n═══ All duration mismatches by exercise ID ═══`);
  const stopAll = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").get();
  const maintAll = await db.collection("FREEV2_MEN_MAINTENANCE_EXERCISES_MODEL").get();
  const stopDurations: Record<string, number[]> = {};
  const maintDurations: Record<string, number[]> = {};
  for (const d of stopAll.docs) {
    const x = d.data();
    stopDurations[x.id] = (x.videos || []).map((v: any) => v.duration).sort((a: number, b: number) => a - b);
  }
  for (const d of maintAll.docs) {
    const x = d.data();
    maintDurations[x.id] = (x.videos || []).map((v: any) => v.duration).sort((a: number, b: number) => a - b);
  }
  const allIds = new Set([...Object.keys(stopDurations), ...Object.keys(maintDurations)]);
  for (const id of [...allIds].sort()) {
    const s = stopDurations[id] || [];
    const m = maintDurations[id] || [];
    const mismatch = JSON.stringify(s) !== JSON.stringify(m);
    console.log(`  ${id.padEnd(28)} stop=[${s.join(",")}]   maint=[${m.join(",")}]${mismatch ? "  ← DIFFERENT" : ""}`);
  }

  // What durations does the STOPPAGE LIST specify per exercise?
  console.log(`\n\n═══ Durations in stoppage LIST (last 5 days) ═══`);
  const stopList = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES").get();
  // Pick days 56-60 (near stoppage end, which is where maintenance users loop from)
  const latestDays = stopList.docs.filter(d => /^Day\d+$/.test(d.id)).sort((a, b) =>
    parseInt(a.id.replace("Day", "")) - parseInt(b.id.replace("Day", ""))
  ).slice(-5);
  for (const d of latestDays) {
    const exercises = d.data().exercises || [];
    console.log(`  ${d.id}:`);
    for (const ex of exercises) {
      const id = ex.exerciseId;
      const d_ = ex.duration;
      const modelHas = (maintDurations[id] || []).includes(d_);
      console.log(`    ${id.padEnd(28)} duration=${d_}   ${modelHas ? "✓" : "✗ NOT IN MAINT MODEL"}`);
    }
  }

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
