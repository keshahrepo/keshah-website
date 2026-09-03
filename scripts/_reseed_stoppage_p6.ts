// p6 — Stretch technique unlock timeline.
//
// Rewrites the 60-day routine schedules for FreeV2 stoppage (both
// STOP and STOP+, both genders) so techniques introduce on a spread-
// out cadence instead of front-loading 5 of 7 into Days 1-4.
//
// New unlock cadence:
//   Day 1:  Scalp Pressing + Scalp Pinching (welcome kit)
//   Day 2:  + Scalp Stretches
//   Day 5:  + Scalp Sliding
//   Day 10: + Scalp Accupressure
//   Day 15: + Neck Presses
//   Day 25: + Neck Stretches (final new content)
//
// The next-unlock card on the streak page always points to something
// less than a week away for the whole first month, killing the two
// dead zones (Days 5-15 and Days 17-30).
//
// Also updates Settings/exercises_unlocks_free_stoppage so the preview
// list matches reality. Days 25-60 keep the full 7-technique rotation.
//
// Usage:
//   npx tsx scripts/_reseed_stoppage_p6.ts          # dry-run
//   npx tsx scripts/_reseed_stoppage_p6.ts --write  # commit

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || '', 'base64').toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const SEED = 7788;
const NUM_DAYS = 60;

// Durations pulled from the current routine data — stays exactly the
// same so total minutes-per-day doesn't shift.
const DURATION: Record<string, number> = {
  scalp_pressing_01: 4,
  scalp_pinching_02: 6,
  scalp_stretches_03: 3,
  scalp_sliding_06: 6,
  scalp_accupressure_04: 3,
  neck_presses_05: 3,
  neck_stretches_07: 3,
  science_of_hair_loss_00: 5, // Day 1 onboarding video only
};

// Titles used in the Settings/exercises_unlocks_free_stoppage preview.
// Copied verbatim from the current preview doc so we don't accidentally
// change the human-readable technique names.
const UNLOCK_TITLES: Record<string, string> = {
  scalp_pressing_01: 'Scalp Pressing',
  scalp_pinching_02: 'Scalp Pinching',
  scalp_stretches_03: 'Scalp Stretches',
  scalp_sliding_06: 'Scalp Sliding',
  scalp_accupressure_04: 'Scalp Accupressure',
  neck_presses_05: 'Neck Presses',
  neck_stretches_07: 'Neck Stretches',
};

// (id, unlockAtDay). unlockAtDay = the value written to the preview
// doc's `days` field, which the mobile app compares with `days < userDay`
// — so unlockAtDay=1 means "unlocks tomorrow when user is on Day 1",
// unlockAtDay=2 means "unlocks tomorrow when user is on Day 2", etc.
// Days 1 (Pressing/Pinching): unlocked immediately (days: null).
const UNLOCK_SCHEDULE: Array<{ id: string; unlockAtDay: number | null }> = [
  { id: 'scalp_pressing_01', unlockAtDay: null },
  { id: 'scalp_pinching_02', unlockAtDay: null },
  { id: 'scalp_stretches_03', unlockAtDay: 1 },   // first appears in routine Day 2
  { id: 'scalp_sliding_06', unlockAtDay: 4 },     // first appears Day 5
  { id: 'scalp_accupressure_04', unlockAtDay: 9 }, // first appears Day 10
  { id: 'neck_presses_05', unlockAtDay: 14 },      // first appears Day 15
  { id: 'neck_stretches_07', unlockAtDay: 24 },    // first appears Day 25
];

// Which technique first appears on which day.
const NEW_ON_DAY: Record<number, string> = {
  2: 'scalp_stretches_03',
  5: 'scalp_sliding_06',
  10: 'scalp_accupressure_04',
  15: 'neck_presses_05',
  25: 'neck_stretches_07',
};

function poolAvailableOn(day: number): string[] {
  const pool = ['scalp_pressing_01', 'scalp_pinching_02'];
  if (day >= 2) pool.push('scalp_stretches_03');
  if (day >= 5) pool.push('scalp_sliding_06');
  if (day >= 10) pool.push('scalp_accupressure_04');
  if (day >= 15) pool.push('neck_presses_05');
  if (day >= 25) pool.push('neck_stretches_07');
  return pool;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Weighted pick without replacement. Recently-used exercises get a
// down-weight so daily routines rotate. Pool always contains what's
// actually unlocked on `day`.
function pickN(rand: () => number, pool: string[], n: number, recent: Set<string>): string[] {
  const weights = pool.map((id) => (recent.has(id) ? 0.35 : 1.0));
  const picked: string[] = [];
  const remaining = [...pool];
  const remainingW = [...weights];
  while (picked.length < n && remaining.length > 0) {
    const total = remainingW.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < remaining.length; idx++) {
      r -= remainingW[idx];
      if (r <= 0) break;
    }
    if (idx >= remaining.length) idx = remaining.length - 1;
    picked.push(remaining[idx]);
    remaining.splice(idx, 1);
    remainingW.splice(idx, 1);
  }
  return picked;
}

interface Slot {
  exerciseId: string;
  duration: number;
}

// Build STOP schedule (3 exercises per day). On unlock days, the new
// technique is included so the user sees the thing that just unlocked.
function buildStopSchedule(seed: number): Array<{ day: number; exercises: Slot[] }> {
  const rand = mulberry32(seed);
  const days: Array<{ day: number; exercises: Slot[] }> = [];
  const recent = new Set<string>();

  for (let day = 1; day <= NUM_DAYS; day++) {
    const pool = poolAvailableOn(day);
    let picked: string[];

    if (day === 1) {
      // Day 1 is fixed: pressing, science video, pinching.
      picked = ['scalp_pressing_01', 'science_of_hair_loss_00', 'scalp_pinching_02'];
    } else {
      // Force include the new technique on its unlock day.
      const forced = NEW_ON_DAY[day];
      const seed_ = forced ? [forced] : [];
      const remainingPool = pool.filter((id) => !seed_.includes(id));
      const extra = pickN(rand, remainingPool, 3 - seed_.length, recent);
      picked = [...seed_, ...extra];
    }

    const exercises: Slot[] = picked.map((id) => ({
      exerciseId: id,
      duration: DURATION[id] ?? 4,
    }));
    days.push({ day, exercises });

    recent.clear();
    for (const id of picked) recent.add(id);
  }
  return days;
}

// STOP+ schedule (5 exercises per day, or fewer when the pool is too
// small). Real STOP+ users are all past Day 60 in practice — the app
// loops days 30-60 there, so early-day content is theoretical only.
function buildStopPlusSchedule(seed: number): Array<{ day: number; exercises: Slot[] }> {
  const rand = mulberry32(seed + 1); // separate stream so it's not identical to STOP
  const days: Array<{ day: number; exercises: Slot[] }> = [];
  const recent = new Set<string>();
  const TARGET = 5;

  for (let day = 1; day <= NUM_DAYS; day++) {
    const pool = poolAvailableOn(day);
    let picked: string[];

    if (day === 1) {
      picked = ['scalp_pressing_01', 'science_of_hair_loss_00', 'scalp_pinching_02'];
    } else {
      const forced = NEW_ON_DAY[day];
      const seed_ = forced ? [forced] : [];
      const remainingPool = pool.filter((id) => !seed_.includes(id));
      const need = Math.min(TARGET, pool.length) - seed_.length;
      const extra = pickN(rand, remainingPool, need, recent);
      picked = [...seed_, ...extra];
    }

    const exercises: Slot[] = picked.map((id) => ({
      exerciseId: id,
      duration: DURATION[id] ?? 4,
    }));
    days.push({ day, exercises });

    recent.clear();
    for (const id of picked) recent.add(id);
  }
  return days;
}

function summarize(schedule: Array<{ day: number; exercises: Slot[] }>, label: string) {
  const totalPerDay = schedule.map((d) => d.exercises.reduce((s, e) => s + e.duration, 0));
  const avg = totalPerDay.reduce((a, b) => a + b, 0) / totalPerDay.length;
  console.log(
    `  ${label}: avg ${avg.toFixed(1)}min (min ${Math.min(...totalPerDay)} / max ${Math.max(...totalPerDay)})`,
  );
  for (const day of [1, 2, 5, 10, 15, 25, 40, 60]) {
    const d = schedule[day - 1];
    const total = d.exercises.reduce((s, e) => s + e.duration, 0);
    console.log(`    Day${String(day).padStart(2)} ${total}min  ${d.exercises.map((e) => `${e.exerciseId}@${e.duration}`).join(', ')}`);
  }
}

async function seedRoutineCollection(collectionName: string, schedule: Array<{ day: number; exercises: Slot[] }>, write: boolean) {
  if (!write) return;
  const batch = db.batch();
  for (const d of schedule) {
    batch.set(db.collection(collectionName).doc(`Day${d.day}`), {
      exercises: d.exercises,
    }, { merge: true });
  }
  await batch.commit();
  console.log(`  ✔ wrote ${schedule.length} day docs → ${collectionName}`);
}

async function updateUnlockPreview(write: boolean) {
  const previewEntries = UNLOCK_SCHEDULE.map(({ id, unlockAtDay }) => ({
    title: UNLOCK_TITLES[id],
    days: unlockAtDay,
    thumbnailImage: '',
    advanced: false,
    description: null,
  }));

  console.log('\n── Settings/exercises_unlocks_free_stoppage (preview doc) ──');
  for (const e of previewEntries) {
    const daysLabel = e.days === null ? 'unlocked' : `Day ${e.days}`;
    console.log(`  ${daysLabel.padStart(10)}  ${e.title}`);
  }

  if (!write) return;

  // Preserve existing thumbnailImage / description fields — only rewrite
  // the days field. Read current doc, remap by title.
  const snap = await db.collection('Settings').doc('exercises_unlocks_free_stoppage').get();
  const existing = (snap.data() as any) || {};

  const merge = (side: 'men' | 'women'): any[] => {
    const currentBySide = (existing[side] || []) as any[];
    const byTitle = new Map(currentBySide.map((e: any) => [e.title, e]));
    return previewEntries.map((newEntry) => {
      const prior = byTitle.get(newEntry.title);
      return {
        title: newEntry.title,
        days: newEntry.days,
        thumbnailImage: prior?.thumbnailImage ?? '',
        advanced: prior?.advanced ?? false,
        description: prior?.description ?? null,
      };
    });
  };

  await db.collection('Settings').doc('exercises_unlocks_free_stoppage').set({
    men: merge('men'),
    women: merge('women'),
  }, { merge: true });
  console.log('  ✔ updated Settings/exercises_unlocks_free_stoppage');
}

async function main() {
  const write = process.argv.includes('--write');

  console.log('\n══ STOP schedule (3 exercises/day) ══');
  const stop = buildStopSchedule(SEED);
  summarize(stop, 'STOP');

  console.log('\n══ STOP+ schedule (5 exercises/day where pool allows) ══');
  const stopPlus = buildStopPlusSchedule(SEED);
  summarize(stopPlus, 'STOP+');

  console.log('\n══ Writing to Firestore ══');
  await seedRoutineCollection('FREEV2_MEN_STOPPAGE_EXERCISES', stop, write);
  await seedRoutineCollection('FREEV2_WOMEN_STOPPAGE_EXERCISES', stop, write);
  await seedRoutineCollection('FREEV2_MEN_STOPPAGE_PLUS_EXERCISES', stopPlus, write);
  await seedRoutineCollection('FREEV2_WOMEN_STOPPAGE_PLUS_EXERCISES', stopPlus, write);
  await updateUnlockPreview(write);

  if (!write) console.log('\nDRY RUN — pass --write to commit.');
}

main().catch((e) => { console.error(e); process.exit(1); });
