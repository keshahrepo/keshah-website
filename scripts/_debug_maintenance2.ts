import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // 1. Get IDs in both collections
  const stopModels = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES_MODEL").get();
  const maintModels = await db.collection("FREEV2_MEN_MAINTENANCE_EXERCISES_MODEL").get();
  console.log(`Stoppage models: ${stopModels.size} docs`);
  console.log(`Maintenance models: ${maintModels.size} docs`);
  const stopIds = new Set(stopModels.docs.map(d => d.data().id));
  const maintIds = new Set(maintModels.docs.map(d => d.data().id));
  console.log(`\nStoppage exercise IDs: [${[...stopIds].join(", ")}]`);
  console.log(`\nMaintenance exercise IDs: [${[...maintIds].join(", ")}]`);

  // 2. Which stoppage IDs are NOT in maintenance models?
  const missing = [...stopIds].filter(id => !maintIds.has(id as string));
  const extra = [...maintIds].filter(id => !stopIds.has(id as string));
  console.log(`\nStoppage IDs missing from maintenance models:`);
  console.log(`  ${missing.length > 0 ? missing.join(", ") : "(none)"}`);
  console.log(`\nIDs only in maintenance (not stoppage):`);
  console.log(`  ${extra.length > 0 ? extra.join(", ") : "(none)"}`);

  // 3. Peek at the stoppage LIST collection
  const stopList = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES").limit(3).get();
  console.log(`\nStoppage LIST sample (first 3 days):`);
  for (const d of stopList.docs) {
    const exIds = (d.data().exercises || []).map((e: any) => e.exerciseId);
    console.log(`  ${d.id}: [${exIds.join(", ")}]`);
  }

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
