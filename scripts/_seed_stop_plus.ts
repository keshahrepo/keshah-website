// One-shot seed of the STOP+ schedule collections:
//   FREEV2_MEN_STOPPAGE_PLUS_EXERCISES   (60 day docs)
//   FREEV2_WOMEN_STOPPAGE_PLUS_EXERCISES (60 day docs)
//
// Content strategy (Aadi's call, 2026-09-02):
//   - REUSE the existing FreeV2 stoppage exercise pool (no new
//     exercise IDs, no new videos, no new models).
//   - 5 exercises per day (up from FreeV2 stoppage's 3), same-for-
//     everyone-on-same-day schedule.
//   - Randomly picked from the pool at generation time, weighted for
//     variety (no back-to-back duplicate 5-sets).
//   - Days 1-60 pre-generated; past Day 60 the mobile app loops
//     Days 30-60 via the existing 31-day cycle math.
//
// Reads from the source-of-truth pool (FREEV2_MEN_STOPPAGE_EXERCISES
// on Days 1-60) to pull the exercise IDs + their typical durations,
// so the STOP+ schedule references only IDs that exist in
// FREEV2_MEN_STOPPAGE_EXERCISES_MODEL (which STOP+ shares — mobile
// side maps freeStoppagePlus.collectionModelName to the same
// collection as freeStoppage).
//
// Idempotent: re-running with the same PRNG seed produces the same
// schedule. Change the SEED constant to reroll.
//
// Usage:
//   npx tsx scripts/_seed_stop_plus.ts           # dry-run: print schedule
//   npx tsx scripts/_seed_stop_plus.ts --write   # commit to Firestore

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const SEED = 4712; // Change to reroll. Same seed → same schedule (deterministic).
const TARGET_EX_PER_DAY = 5;
const NUM_DAYS = 60;

// Mulberry32 — tiny deterministic PRNG. Keeps generation reproducible
// so re-runs of this script don't shuffle every user's schedule.
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ExerciseSlot {
  exerciseId: string;
  duration: number;
}

// Build the pool: pull every unique (exerciseId, duration) pair from
// the existing FreeV2 stoppage schedule across all 60 days. Filter out
// the "science of hair loss" onboarding video (only appears Day 1) so
// STOP+ doesn't fire it repeatedly.
async function loadPool(collectionName: string): Promise<{
  ids: string[];
  durationsById: Record<string, number[]>;
}> {
  const snap = await db.collection(collectionName).get();
  const durationsById: Record<string, Set<number>> = {};
  for (const doc of snap.docs) {
    const exercises = (doc.data().exercises as ExerciseSlot[]) ?? [];
    for (const ex of exercises) {
      if (!ex.exerciseId || typeof ex.duration !== "number") continue;
      // Skip the Day-1-only onboarding video — not a real technique.
      if (ex.exerciseId === "science_of_hair_loss_00") continue;
      if (!durationsById[ex.exerciseId]) durationsById[ex.exerciseId] = new Set();
      durationsById[ex.exerciseId].add(ex.duration);
    }
  }
  const ids = Object.keys(durationsById).sort();
  return {
    ids,
    durationsById: Object.fromEntries(
      Object.entries(durationsById).map(([k, v]) => [k, [...v].sort()]),
    ),
  };
}

// Pick 5 unique exerciseIds for a given day, weighted for variety
// (an ID that appeared yesterday gets down-weighted so it's less
// likely — but not impossible — to appear today).
function pickForDay(
  rand: () => number,
  ids: string[],
  yesterday: Set<string>,
): string[] {
  const weights = ids.map((id) => (yesterday.has(id) ? 0.4 : 1.0));
  const picked: string[] = [];
  const remaining = [...ids];
  const remainingWeights = [...weights];
  while (picked.length < TARGET_EX_PER_DAY && remaining.length > 0) {
    const totalWeight = remainingWeights.reduce((a, b) => a + b, 0);
    let r = rand() * totalWeight;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= remainingWeights[idx];
      if (r <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
    remainingWeights.splice(idx, 1);
  }
  return picked;
}

// For each picked exerciseId, pick a duration variant. Prefer the
// longest available so total session length stays in the 18-25 min
// zone (per the "make it longer" goal). Falls back to shortest if
// there's only one variant.
function pickDuration(id: string, durationsById: Record<string, number[]>): number {
  const variants = durationsById[id] ?? [];
  if (variants.length === 0) return 5; // reasonable fallback
  // Prefer longest — front-loads STOP+'s "longer than FreeV2" identity.
  return variants[variants.length - 1];
}

function buildSchedule(
  ids: string[],
  durationsById: Record<string, number[]>,
  seed: number,
): Array<{ day: number; totalMinutes: number; exercises: ExerciseSlot[] }> {
  const rand = mulberry32(seed);
  const days: Array<{ day: number; totalMinutes: number; exercises: ExerciseSlot[] }> = [];
  let yesterday = new Set<string>();
  for (let day = 1; day <= NUM_DAYS; day++) {
    const picked = pickForDay(rand, ids, yesterday);
    const exercises: ExerciseSlot[] = picked.map((id) => ({
      exerciseId: id,
      duration: pickDuration(id, durationsById),
    }));
    const totalMinutes = exercises.reduce((s, e) => s + e.duration, 0);
    days.push({ day, totalMinutes, exercises });
    yesterday = new Set(picked);
  }
  return days;
}

async function seedGender(sourceCol: string, targetCol: string, write: boolean) {
  console.log(`\n── ${targetCol} ──`);
  const { ids, durationsById } = await loadPool(sourceCol);
  console.log(`  pool: ${ids.length} exercises — [${ids.join(", ")}]`);
  console.log(`  duration variants per ID:`);
  for (const id of ids) {
    console.log(`    ${id}: [${(durationsById[id] ?? []).join(", ")}]`);
  }

  const schedule = buildSchedule(ids, durationsById, SEED);
  const totalMinutes = schedule.reduce((s, d) => s + d.totalMinutes, 0);
  const avg = totalMinutes / schedule.length;
  console.log(
    `  generated ${schedule.length} days, avg ${avg.toFixed(1)} min/day (min ${Math.min(...schedule.map((d) => d.totalMinutes))} / max ${Math.max(...schedule.map((d) => d.totalMinutes))})`,
  );

  // Print sample days
  for (const day of [1, 15, 30, 45, 60]) {
    const d = schedule[day - 1];
    console.log(`    Day${day}: ${d.totalMinutes}min — ${d.exercises.map((e) => `${e.exerciseId}@${e.duration}`).join(", ")}`);
  }

  if (!write) {
    console.log(`  DRY RUN — pass --write to commit.`);
    return;
  }

  const batch = db.batch();
  for (const d of schedule) {
    batch.set(
      db.collection(targetCol).doc(`Day${d.day}`),
      { totalMinutes: d.totalMinutes, exercises: d.exercises },
      { merge: true },
    );
  }
  await batch.commit();
  console.log(`  ✔ wrote ${schedule.length} day docs to ${targetCol}`);
}

async function main() {
  const write = process.argv.includes("--write");
  await seedGender(
    "FREEV2_MEN_STOPPAGE_EXERCISES",
    "FREEV2_MEN_STOPPAGE_PLUS_EXERCISES",
    write,
  );
  await seedGender(
    "FREEV2_WOMEN_STOPPAGE_EXERCISES",
    "FREEV2_WOMEN_STOPPAGE_PLUS_EXERCISES",
    write,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
