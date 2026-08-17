// Migrate FREE_MAINTENANCE users back to FREE_STOPPAGE.
//
// Why: maintenance is dead-stage code (no path writes it anymore). All users
// currently in FREE_MAINTENANCE have routine completions stored in
// `maintenance_progress.dayN`, which the existing app's progress_bloc plots
// onto the wrong calendar dates. Stoppage and maintenance use identical
// exercise content (dashboard_repo overrides effectiveStage to freeStoppage
// for non-regrowth FreeV2 users), so collapsing the stages is purely a
// cleanup, not a UX change.
//
// What this does, per user where treatment_stage == FREE_MAINTENANCE:
//   1. Merge maintenance_progress.dayN into progress.dayN.
//      - If progress.dayN is missing → copy from maintenance_progress.
//      - If progress.dayN exists and is all-completed → keep it (no-op).
//      - If progress.dayN exists but some entries are incomplete AND
//        maintenance_progress.dayN is fully completed → take maintenance
//        (it represents the routine actually finished).
//      - If both incomplete → keep progress (no-op).
//   2. Flip treatment_stage → FREE_STOPPAGE.
//   3. Leave maintenance_progress untouched (rollback safety net).
//
// Run:
//   set -a && source .env.local && set +a
//   node scripts/migrate-maintenance-to-stoppage.mjs            # dry run
//   node scripts/migrate-maintenance-to-stoppage.mjs --apply    # write
//
// Rerunnable: only touches users still tagged FREE_MAINTENANCE, so a second
// run after a partial failure picks up exactly the unfinished users.

import admin from "firebase-admin";

const DRY_RUN = !process.argv.includes("--apply");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error("Missing FIREBASE_SERVICE_ACCOUNT env var");
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(raw);
} catch {
  serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf-8"));
}

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY (writing)"}`);

const snap = await db
  .collection("Users")
  .where("treatment_stage", "==", "FREE_MAINTENANCE")
  .get();

console.log(`Found ${snap.size} users in FREE_MAINTENANCE`);

let processedCount = 0;
let mergedCount = 0;
let stageOnlyCount = 0;
let errorCount = 0;
let totalDaysMerged = 0;

const BATCH_SIZE = 25;
const docs = snap.docs;

for (let i = 0; i < docs.length; i += BATCH_SIZE) {
  const batch = docs.slice(i, i + BATCH_SIZE);
  await Promise.allSettled(
    batch.map(async (doc) => {
      const d = doc.data();
      const email = d.email ?? "-";
      const mp = d.maintenance_progress ?? {};
      const existingProgress = d.progress ?? {};

      const updatedProgress = { ...existingProgress };
      const daysMerged = [];

      for (const dayKey of Object.keys(mp)) {
        const mpEntries = mp[dayKey];
        if (!Array.isArray(mpEntries) || mpEntries.length === 0) continue;

        const existingEntries = updatedProgress[dayKey];

        if (!Array.isArray(existingEntries)) {
          // No conflict — just take maintenance entries
          updatedProgress[dayKey] = mpEntries;
          daysMerged.push(dayKey);
          continue;
        }

        const existingAllComplete = existingEntries.every(
          (e) => e?.is_completed === true
        );
        if (existingAllComplete) continue; // already shown as completed

        const mpAllComplete = mpEntries.every((e) => e?.is_completed === true);
        if (mpAllComplete) {
          // existing is partially incomplete; maintenance is fully completed
          updatedProgress[dayKey] = mpEntries;
          daysMerged.push(dayKey);
        }
        // else: both partially incomplete — keep existing as-is
      }

      const willMerge = daysMerged.length > 0;
      const update = {
        treatment_stage: "FREE_STOPPAGE",
      };
      if (willMerge) update.progress = updatedProgress;

      try {
        if (DRY_RUN) {
          console.log(
            `[DRY] ${doc.id.padEnd(28)} ${email.padEnd(40)} ` +
              `merge_days=${daysMerged.length} ${
                daysMerged.length > 0 ? `(${daysMerged.join(",")})` : ""
              }`
          );
        } else {
          await doc.ref.update(update);
          console.log(
            `[OK ] ${doc.id.padEnd(28)} ${email.padEnd(40)} ` +
              `merge_days=${daysMerged.length}`
          );
        }
        if (willMerge) {
          mergedCount++;
          totalDaysMerged += daysMerged.length;
        } else {
          stageOnlyCount++;
        }
        processedCount++;
      } catch (err) {
        console.error(
          `[ERR] ${doc.id} (${email}): ${err.message ?? err}`
        );
        errorCount++;
      }
    })
  );
  console.log(`...processed ${Math.min(i + BATCH_SIZE, docs.length)}/${docs.length}`);
}

console.log("\n=== Summary ===");
console.log(`Mode:           ${DRY_RUN ? "DRY RUN (no writes)" : "APPLY"}`);
console.log(`Processed:      ${processedCount}`);
console.log(`With merge:     ${mergedCount} (total day-keys merged: ${totalDaysMerged})`);
console.log(`Stage-flip only: ${stageOnlyCount}`);
console.log(`Errors:         ${errorCount}`);
if (DRY_RUN) {
  console.log("\nRe-run with --apply to perform writes.");
}

process.exit(errorCount > 0 ? 1 : 0);
