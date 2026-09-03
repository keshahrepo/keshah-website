import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  console.log("=== VIP EXERCISE_LIST — ALL 20 DAYS ===");
  const listSnap = await db.collection("Exercise_List").get();
  console.log(`Total docs in Exercise_List: ${listSnap.size}`);
  console.log(`Doc IDs: ${listSnap.docs.map(d => d.id).sort().join(", ")}`);

  // Gather all day docs sorted numerically
  const dayDocs = listSnap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .sort((a, b) => {
      const na = parseInt(a.id.replace(/[^0-9]/g, "")) || 0;
      const nb = parseInt(b.id.replace(/[^0-9]/g, "")) || 0;
      return na - nb;
    });

  let totalExercises = 0;
  const allExerciseIds = new Set<string>();
  const perDayDurations: number[] = [];
  const perExerciseDurations: number[] = [];
  const perDayExCount: number[] = [];
  const perDayFirstAppearance: Record<string, number> = {};

  console.log(`\n── Per-day composition ──`);
  for (const { id, data } of dayDocs) {
    const exs = (data.exercises as any[]) || [];
    const dayTotal = exs.reduce((s, e) => s + (Number(e.duration) || 0), 0);
    perDayDurations.push(dayTotal);
    perDayExCount.push(exs.length);
    totalExercises += exs.length;
    const parts: string[] = [];
    for (const e of exs) {
      allExerciseIds.add(e.exerciseId);
      perExerciseDurations.push(Number(e.duration) || 0);
      if (!(e.exerciseId in perDayFirstAppearance)) {
        const dayNum = parseInt(id.replace(/[^0-9]/g, "")) || 0;
        perDayFirstAppearance[e.exerciseId] = dayNum;
      }
      parts.push(`${e.exerciseId}(${e.duration}min)`);
    }
    console.log(`  ${id.padEnd(6)}: ${exs.length} ex, ${dayTotal} min total → [${parts.join(", ")}]`);
  }

  console.log(`\n── First-appearance schedule (VIP unlock ladder) ──`);
  for (const [exId, day] of Object.entries(perDayFirstAppearance).sort((a, b) => a[1] - b[1])) {
    console.log(`  Day ${String(day).padStart(2)} · ${exId}`);
  }

  const min = (arr: number[]) => Math.min(...arr);
  const max = (arr: number[]) => Math.max(...arr);
  const avg = (arr: number[]) => (arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1);

  console.log(`\n── Aggregate stats ──`);
  console.log(`  Total exercise-slots across all ${dayDocs.length} days: ${totalExercises}`);
  console.log(`  Unique exerciseId count: ${allExerciseIds.size}`);
  console.log(`  Unique exerciseIds: ${[...allExerciseIds].sort().join(", ")}`);
  console.log(`  Exercises per day — min: ${min(perDayExCount)}, max: ${max(perDayExCount)}, avg: ${avg(perDayExCount)}`);
  console.log(`  Session duration/day — min: ${min(perDayDurations)}, max: ${max(perDayDurations)}, avg: ${avg(perDayDurations)}`);
  console.log(`  Duration/exercise — min: ${min(perExerciseDurations)}, max: ${max(perExerciseDurations)}, avg: ${avg(perExerciseDurations)}`);

  // Sample Day 1 vs Day 20 raw docs
  console.log(`\n── Raw Day1 doc ──`);
  const d1 = await db.collection("Exercise_List").doc("Day1").get();
  console.log(JSON.stringify(d1.data(), null, 2));
  console.log(`\n── Raw Day20 doc ──`);
  const d20 = await db.collection("Exercise_List").doc("Day20").get();
  console.log(JSON.stringify(d20.data(), null, 2));

  // Exercise_Models collection
  console.log(`\n\n=== EXERCISE_MODELS (VIP definitions) ===`);
  const modelSnap = await db.collection("Exercise_Models").get();
  console.log(`Total docs in Exercise_Models: ${modelSnap.size}`);
  const sortedModels = modelSnap.docs.sort((a, b) => a.id.localeCompare(b.id));
  for (const d of sortedModels) {
    const data = d.data();
    const keys = Object.keys(data).sort().join(",");
    console.log(`  ${d.id.padEnd(30)} · name: "${data.name || data.title || "(none)"}" · keys=[${keys}]`);
  }

  // Sample one model doc to see structure
  if (sortedModels.length > 0) {
    console.log(`\n── Sample Exercise_Models doc (${sortedModels[0].id}) ──`);
    console.log(JSON.stringify(sortedModels[0].data(), null, 2));
  }

  // Compare to FreeV2 stoppage for direct contrast
  console.log(`\n\n=== FREEV2_MEN_STOPPAGE_EXERCISES — CONTRAST ===`);
  // Try both possible collection names
  for (const collName of ["FREEV2_MEN_STOPPAGE_EXERCISES", "FREEV2_MENS_STOPPAGE_EXERCISES"]) {
    const s = await db.collection(collName).get();
    console.log(`\n${collName}: ${s.size} docs`);
    if (s.size === 0) continue;
    const daySample = ["Day1", "Day15", "Day30", "Day45", "Day60"];
    let fv2Total = 0;
    let fv2Days = 0;
    const fv2Durations: number[] = [];
    const fv2ExCounts: number[] = [];
    for (const d of s.docs) {
      const exs = (d.data().exercises as any[]) || [];
      fv2Total += exs.length;
      fv2Days++;
      const dur = exs.reduce((sum, e) => sum + (Number(e.duration) || 0), 0);
      fv2Durations.push(dur);
      fv2ExCounts.push(exs.length);
    }
    console.log(`  Total exercise-slots: ${fv2Total} across ${fv2Days} days`);
    if (fv2ExCounts.length > 0) {
      console.log(`  Exercises/day — min: ${min(fv2ExCounts)}, max: ${max(fv2ExCounts)}, avg: ${avg(fv2ExCounts)}`);
      console.log(`  Duration/day — min: ${min(fv2Durations)}, max: ${max(fv2Durations)}, avg: ${avg(fv2Durations)}`);
    }
    for (const dId of daySample) {
      const dsnap = await db.collection(collName).doc(dId).get();
      if (!dsnap.exists) continue;
      const exs = (dsnap.data()!.exercises as any[]) || [];
      const dur = exs.reduce((s, e) => s + (Number(e.duration) || 0), 0);
      const parts = exs.map(e => `${e.exerciseId}(${e.duration}min)`).join(", ");
      console.log(`  ${dId}: ${exs.length} ex, ${dur} min total → [${parts}]`);
    }
    const modelName = collName + "_MODEL";
    const ms = await db.collection(modelName).get();
    console.log(`  ${modelName}: ${ms.size} model docs`);
  }

  process.exit(0);
})();
