import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Simplify the FreeV2 stoppage routine for baseline data:
//  - KEEP: Science of Hair Loss video on Day 1 (trust-building right
//    after commitment).
//  - REMOVE: What To Expect (redundant with paywall), founder_regrow
//    (Day 5), founder_check_in (Day 7 — replaced by new pinch check-in
//    modal), founder_qa (Day 15).
// Applies to BOTH men and women collections.
//
// Dry-run by default. Pass --apply to actually write.

const APPLY = process.argv.includes("--apply");

const ITEMS_TO_REMOVE = new Set<string>([
  "what_to_expect_00",
  "founder_regrow_day_5",
  "founder_check_in_day_7",
  "founder_qa_day_15",
]);

const COLLECTIONS = [
  "FREEV2_MEN_STOPPAGE_EXERCISES",
  "FREEV2_WOMEN_STOPPAGE_EXERCISES",
];

// Scan enough days to catch any straggler founder-video items — the
// audit showed them only on Days 1, 5, 7, 15 but scanning a wider
// window is cheap insurance in case future days have similar items.
const MAX_DAY = 60;

type ExerciseItem = { exerciseId: string; duration?: number };

(async () => {
  console.log(`Mode: ${APPLY ? "APPLY (writes)" : "DRY RUN (no writes)"}\n`);

  let totalDaysChanged = 0;

  for (const coll of COLLECTIONS) {
    console.log(`=== ${coll} ===`);
    for (let day = 1; day <= MAX_DAY; day++) {
      const docRef = db.collection(coll).doc(`Day${day}`);
      const snap = await docRef.get();
      if (!snap.exists) continue;
      const data = snap.data()!;
      const exs = (data.exercises as ExerciseItem[]) || [];
      const filtered = exs.filter((e) => !ITEMS_TO_REMOVE.has(e.exerciseId));
      if (filtered.length === exs.length) continue; // no changes

      const removed = exs.filter((e) => ITEMS_TO_REMOVE.has(e.exerciseId));
      console.log(
        `  Day${day.toString().padEnd(2)}: removing ${removed
          .map((e) => e.exerciseId)
          .join(", ")} (was ${exs.length} items, becomes ${filtered.length})`
      );
      totalDaysChanged++;

      if (APPLY) {
        await docRef.update({ exercises: filtered });
      }
    }
    console.log("");
  }

  console.log(
    `\n${APPLY ? "Applied" : "Would apply"} changes to ${totalDaysChanged} day docs.`
  );
  if (!APPLY) console.log("Re-run with --apply to actually write.");
  process.exit(0);
})();
