import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  // How many exercises per day in Exercise_List — the VIP source
  const days = ["Day1","Day2","Day3","Day7","Day10","Day14","Day17","Day20"];
  console.log("── Exercise_List (VIP source) ──");
  for (const dId of days) {
    const s = await db.collection("Exercise_List").doc(dId).get();
    const ex = s.data()?.exercises ?? [];
    const totalDur = ex.reduce((sum: number, e: any) => sum + (e.duration || 0), 0);
    console.log(`  ${dId}: ${ex.length} exercises, ${totalDur} min total, ids=[${ex.map((e: any) => e.exerciseId).join(", ")}]`);
  }

  // Compare with Free_Exercise_List (FreeV1)
  console.log("\n── Free_Exercise_List (FreeV1) ──");
  for (const dId of days) {
    const s = await db.collection("Free_Exercise_List").doc(dId).get();
    const ex = s.data()?.exercises ?? [];
    const totalDur = ex.reduce((sum: number, e: any) => sum + (e.duration || 0), 0);
    console.log(`  ${dId}: ${ex.length} exercises, ${totalDur} min total, ids=[${ex.map((e: any) => e.exerciseId).join(", ")}]`);
  }

  // Long-tenured VIP users — pull one and see their historical progress
  const vips = await db.collection("Users")
    .where("user_type", "==", "vip")
    .limit(50).get();
  console.log(`\n── VIP progress samples (max exercise counts across days) ──`);
  for (const doc of vips.docs.slice(0, 10)) {
    const d = doc.data();
    const progress = d.progress ?? {};
    const dayCounts: number[] = [];
    for (let i = 1; i <= 60; i++) {
      const entries = progress[`day${i}`] ?? [];
      if (entries.length > 0) dayCounts.push(entries.length);
    }
    if (dayCounts.length > 0) {
      const min = Math.min(...dayCounts);
      const max = Math.max(...dayCounts);
      console.log(`  ${doc.id} (${d.email ?? '?'}): ${dayCounts.length} completed days, min ${min}ex, max ${max}ex`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
