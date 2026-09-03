import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Deep dive on FREEV2_MEN_STOPPAGE_EXERCISES (60-day stoppage routine)
// Report: exercise count per day, duration per day, unique exercises,
// what changes across the 60 days, and simulate Day 500 wrap.
(async () => {
  const LIST = "FREEV2_MEN_STOPPAGE_EXERCISES";
  const MODEL = "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL";

  // 1. Pull the full exercise model registry
  console.log(`\n=== ${MODEL} (all exercises defined) ===`);
  const modelSnap = await db.collection(MODEL).get();
  const modelMap: Record<string, any> = {};
  for (const d of modelSnap.docs.sort((a, b) => a.id.localeCompare(b.id))) {
    const data = d.data();
    modelMap[d.id] = data;
    console.log(
      `  ${d.id.padEnd(35)} | name="${(data.name || data.title || "?").toString().slice(0, 60)}" | duration=${data.duration ?? "?"}`
    );
  }
  console.log(`  TOTAL exercise definitions: ${modelSnap.size}`);

  // 2. Pull every day doc 1..60 with full detail
  console.log(`\n=== ${LIST} full 60-day scan ===`);
  const perDay: Array<{ day: number; count: number; totalDur: number; ids: string[]; raw: any[] }> = [];
  const firstAppearance: Record<string, number> = {};
  const usageCount: Record<string, number> = {};

  for (let day = 1; day <= 60; day++) {
    const snap = await db.collection(LIST).doc(`Day${day}`).get();
    if (!snap.exists) {
      console.log(`Day${day.toString().padStart(2)}: MISSING`);
      continue;
    }
    const exs = (snap.data()!.exercises as any[]) || [];
    const totalDur = exs.reduce((s, e) => s + (e.duration ?? 0), 0);
    const ids = exs.map((e) => e.exerciseId);
    perDay.push({ day, count: exs.length, totalDur, ids, raw: exs });
    for (const id of ids) {
      usageCount[id] = (usageCount[id] || 0) + 1;
      if (!(id in firstAppearance)) firstAppearance[id] = day;
    }
  }

  console.log(`\n--- Per-day summary ---`);
  console.log(`day | #ex | dur(min) | exerciseIds`);
  for (const r of perDay) {
    console.log(
      `Day${r.day.toString().padStart(2)} | ${r.count.toString().padStart(2)}  | ${r.totalDur.toString().padStart(3)}      | ${r.ids.join(", ")}`
    );
  }

  // 3. Detailed dump of Days 1, 15, 30, 45, 60
  const spotDays = [1, 15, 30, 45, 60];
  console.log(`\n--- SPOT DETAIL: Days 1, 15, 30, 45, 60 ---`);
  for (const day of spotDays) {
    const row = perDay.find((r) => r.day === day);
    if (!row) {
      console.log(`Day ${day}: missing`);
      continue;
    }
    console.log(`\n== Day ${day}: ${row.count} exercises, ${row.totalDur} min total ==`);
    for (const e of row.raw) {
      const m = modelMap[e.exerciseId] || {};
      console.log(
        `   - ${e.exerciseId}: ${(m.name || m.title || "?").toString().slice(0, 45)} | duration_in_day=${e.duration ?? "?"} min | model_default_dur=${m.duration ?? "?"}`
      );
    }
  }

  // 4. Aggregates across 60 days
  console.log(`\n--- Aggregates across 60-day loop ---`);
  const counts = perDay.map((r) => r.count);
  const durs = perDay.map((r) => r.totalDur);
  const uniqueIds = new Set<string>();
  for (const r of perDay) for (const id of r.ids) uniqueIds.add(id);
  console.log(`  Days present: ${perDay.length}/60`);
  console.log(`  Exercise count per day: min=${Math.min(...counts)}, max=${Math.max(...counts)}, avg=${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(2)}`);
  console.log(`  Duration per day (min): min=${Math.min(...durs)}, max=${Math.max(...durs)}, avg=${(durs.reduce((a, b) => a + b, 0) / durs.length).toFixed(2)}`);
  console.log(`  Unique exercises used across all 60 days: ${uniqueIds.size}`);
  console.log(`  Exercises defined in MODEL: ${modelSnap.size}`);
  console.log(`  MODEL exercises NEVER used in any day: ${modelSnap.size - uniqueIds.size}`);

  console.log(`\n  Usage histogram (how many days each exercise appears):`);
  for (const [id, ct] of Object.entries(usageCount).sort((a, b) => b[1] - a[1])) {
    const m = modelMap[id] || {};
    console.log(
      `    ${id.padEnd(35)} appears on ${ct.toString().padStart(2)} days | first Day${firstAppearance[id]} | "${(m.name || m.title || "?").toString().slice(0, 40)}"`
    );
  }

  // 5. Simulate wrap-to-Days-30-60 loop on Day 500
  // App loops Day 30-60 after Day 60. So a user on Day 500 (= 60 + 440)
  // For each day past 60, day = 30 + ((n - 61) mod 31)  — 31-day cycle over Days 30-60 inclusive
  console.log(`\n--- Day 500 loop simulation ---`);
  console.log(`  After Day 60, users cycle through Days 30..60 (31-day loop).`);
  console.log(`  Day 500 = Day 60 + 440 extra days = loop iteration ${Math.ceil(440 / 31)}, position ${440 % 31}`);
  const loopWindow = perDay.filter((r) => r.day >= 30 && r.day <= 60);
  const loopCounts = loopWindow.map((r) => r.count);
  const loopDurs = loopWindow.map((r) => r.totalDur);
  const loopIds = new Set<string>();
  for (const r of loopWindow) for (const id of r.ids) loopIds.add(id);
  console.log(`  Days 30-60 window (${loopWindow.length} days):`);
  console.log(`    Exercise count: min=${Math.min(...loopCounts)}, max=${Math.max(...loopCounts)}, avg=${(loopCounts.reduce((a, b) => a + b, 0) / loopCounts.length).toFixed(2)}`);
  console.log(`    Duration min: min=${Math.min(...loopDurs)}, max=${Math.max(...loopDurs)}, avg=${(loopDurs.reduce((a, b) => a + b, 0) / loopDurs.length).toFixed(2)}`);
  console.log(`    Unique exercises in the loop window: ${loopIds.size}`);
  console.log(`    Sum duration over one 31-day loop: ${loopDurs.reduce((a, b) => a + b, 0)} min`);

  // 6. First-appearance progression (does routine intensify?)
  console.log(`\n--- Progression: unique exercises introduced per 10-day chunk ---`);
  for (let chunk = 0; chunk < 6; chunk++) {
    const lo = chunk * 10 + 1;
    const hi = lo + 9;
    const newInChunk = Object.entries(firstAppearance).filter(([, d]) => d >= lo && d <= hi);
    console.log(`  Days ${lo}-${hi}: ${newInChunk.length} new exercise(s) introduced: ${newInChunk.map(([id]) => id).join(", ") || "(none)"}`);
  }

  process.exit(0);
})();
