// Moves the founder check-in video from Day 3 → Day 7 in the FreeV2 stoppage
// schedule. Aadi's video copy says "you've been doing this for a week," so
// it has to land on day 7, not day 3.
//
// What this does:
//   1. Reads the existing `founder_check_in_day_3` exercise model
//   2. Writes an identical model under id `founder_check_in_day_7`
//   3. Removes `founder_check_in_day_3` from {MEN,WOMEN}_STOPPAGE/Day3.exercises
//   4. Appends `founder_check_in_day_7` to {MEN,WOMEN}_STOPPAGE/Day7.exercises
//   5. Deletes the orphan `founder_check_in_day_3` model document
//
// Idempotent — safe to re-run.
//
// Run from repo root:
//   DRY:    npx ts-node scripts/_move_checkin_to_day_7.ts
//   APPLY:  npx ts-node scripts/_move_checkin_to_day_7.ts --apply

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const DRY_RUN = !process.argv.includes("--apply");

const OLD_ID = "founder_check_in_day_3";
const NEW_ID = "founder_check_in_day_7";
const FROM_DAY = 3;
const TO_DAY = 7;

const COLLECTIONS = [
  { name: "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_MEN_STOPPAGE_EXERCISES" },
  { name: "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_WOMEN_STOPPAGE_EXERCISES" },
];

async function migrate(modelCol: string, listCol: string): Promise<void> {
  console.log(`\n━━━ ${modelCol} ━━━`);

  // 1. Read the old model. If it doesn't exist anymore (re-run case), check
  //    if the new one already exists and skip the copy.
  const oldRef = db.collection(modelCol).doc(OLD_ID);
  const newRef = db.collection(modelCol).doc(NEW_ID);
  const oldSnap = await oldRef.get();
  const newSnap = await newRef.get();

  if (!oldSnap.exists && !newSnap.exists) {
    console.log(`  ! Neither ${OLD_ID} nor ${NEW_ID} exists in ${modelCol}. Skipping.`);
    return;
  }

  if (oldSnap.exists && !newSnap.exists) {
    const data = oldSnap.data() ?? {};
    const newDoc = { ...data, id: NEW_ID };
    if (DRY_RUN) {
      console.log(`  [dry] would write ${modelCol}/${NEW_ID} (copy of ${OLD_ID})`);
    } else {
      await newRef.set(newDoc);
      console.log(`  ✓ wrote ${modelCol}/${NEW_ID}`);
    }
  } else if (newSnap.exists) {
    console.log(`  ${modelCol}/${NEW_ID} already exists. Skipping copy.`);
  }

  // 2. Pull from Day3 list.
  const fromRef = db.collection(listCol).doc(`Day${FROM_DAY}`);
  const fromSnap = await fromRef.get();
  if (fromSnap.exists) {
    const exercises = (fromSnap.data() as { exercises?: { exerciseId: string; duration: number }[] })
      .exercises ?? [];
    const filtered = exercises.filter((e) => e.exerciseId !== OLD_ID);
    if (filtered.length === exercises.length) {
      console.log(`  ${listCol}/Day${FROM_DAY} doesn't reference ${OLD_ID}. Skipping pull.`);
    } else if (DRY_RUN) {
      console.log(`  [dry] would set ${listCol}/Day${FROM_DAY}.exercises to (${filtered.length} entries):`);
      for (const e of filtered) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    } else {
      await fromRef.update({ exercises: filtered });
      console.log(`  ✓ pulled ${OLD_ID} from ${listCol}/Day${FROM_DAY} (${filtered.length} tasks remain)`);
    }
  } else {
    console.log(`  ! ${listCol}/Day${FROM_DAY} does not exist`);
  }

  // 3. Append to Day7 list — keep the duration from the model itself.
  //    Default to 3 (matches what _add_founder_videos.ts wrote).
  const toRef = db.collection(listCol).doc(`Day${TO_DAY}`);
  const toSnap = await toRef.get();
  if (!toSnap.exists) {
    console.log(`  ! ${listCol}/Day${TO_DAY} does not exist, skipping append`);
    return;
  }
  const toExisting = (toSnap.data() as { exercises?: { exerciseId: string; duration: number }[] })
    .exercises ?? [];
  if (toExisting.some((e) => e.exerciseId === NEW_ID)) {
    console.log(`  ${listCol}/Day${TO_DAY} already has ${NEW_ID}. Skipping append.`);
  } else {
    const next = [...toExisting, { exerciseId: NEW_ID, duration: 3 }];
    if (DRY_RUN) {
      console.log(`  [dry] would set ${listCol}/Day${TO_DAY}.exercises to (${next.length} entries):`);
      for (const e of next) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    } else {
      await toRef.update({ exercises: next });
      console.log(`  ✓ appended ${NEW_ID} to ${listCol}/Day${TO_DAY} (${next.length} tasks total)`);
    }
  }

  // 4. Delete the orphan old model. Only if there are no remaining list refs.
  if (oldSnap.exists) {
    if (DRY_RUN) {
      console.log(`  [dry] would delete ${modelCol}/${OLD_ID} (orphan)`);
    } else {
      await oldRef.delete();
      console.log(`  ✓ deleted orphan ${modelCol}/${OLD_ID}`);
    }
  }
}

(async () => {
  for (const { name, listName } of COLLECTIONS) {
    await migrate(name, listName);
  }
  console.log(`\n${DRY_RUN ? "DRY RUN done — add --apply to write." : "✓ Done. Check-in is now on Day 7."}`);
  process.exit(0);
})().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("ERR:", msg);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
