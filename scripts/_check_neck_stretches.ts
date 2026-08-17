import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("FREEV2_MEN_STOPPAGE_EXERCISES").get();
  const byNum = snap.docs.map(d => ({
    day: parseInt(d.id.replace("Day", "")),
    id: d.id,
    exercises: (d.data().exercises || []).map((e: any) => e.exerciseId),
  })).sort((a, b) => a.day - b.day);

  console.log(`All stoppage days (first 20):`);
  for (const d of byNum.slice(0, 20)) {
    const neck = d.exercises.some((e: string) => e.startsWith("neck_"));
    console.log(`  ${d.id.padEnd(6)} ${neck ? "🧘 " : "   "}[${d.exercises.join(", ")}]`);
  }

  const firstNeck = byNum.find(d => d.exercises.some((e: string) => e === "neck_stretches_07"));
  console.log(`\nFirst day with neck_stretches_07: ${firstNeck?.id || "NEVER"}`);

  const allNeckDays = byNum.filter(d => d.exercises.some((e: string) => e === "neck_stretches_07")).map(d => d.day);
  console.log(`All days with neck_stretches_07: [${allNeckDays.join(", ")}]`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
