// Admin toggle — flip a specific user into (or out of) STOP+ mode by
// email. Refuses to flip anyone whose current stage isn't FREE_STOPPAGE
// (or FREE_STOPPAGE_PLUS on --revert). No dashboard UI — this script
// is the whole admin surface until STOP+ ships to real users.
//
// Usage:
//   npx tsx scripts/_grant_stop_plus.ts <email>            # dry-run
//   npx tsx scripts/_grant_stop_plus.ts <email> --write    # commit
//   npx tsx scripts/_grant_stop_plus.ts <email> --revert   # dry-run revert
//   npx tsx scripts/_grant_stop_plus.ts <email> --revert --write

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith("--"));
  const write = args.includes("--write");
  const revert = args.includes("--revert");
  if (!email) {
    console.error("Usage: npx tsx scripts/_grant_stop_plus.ts <email> [--write] [--revert]");
    process.exit(1);
  }

  const targetStage = revert ? "FREE_STOPPAGE" : "FREE_STOPPAGE_PLUS";
  const expectedCurrent = revert ? "FREE_STOPPAGE_PLUS" : "FREE_STOPPAGE";

  const snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`User with email ${email} not found.`);
    process.exit(1);
  }
  const doc = snap.docs[0];
  const d = doc.data();
  const currentStage = d.treatment_stage as string | undefined;
  const userType = d.user_type as string | undefined;

  console.log(`── ${email} ──`);
  console.log(`  UID: ${doc.id}`);
  console.log(`  user_type: ${userType}`);
  console.log(`  current treatment_stage: ${currentStage}`);
  console.log(`  pro: ${d.pro}`);
  console.log(`  selected_gender: ${d.selected_gender}`);

  // Engagement snapshot — helps Aadi sanity-check the target user
  // before flipping. Same pattern as _stop_plus_target_audience.ts.
  const progress = (d.progress as Record<string, unknown[]>) ?? {};
  const daysCompleted = Object.values(progress).filter(
    (v) => Array.isArray(v) && v.some((e) => typeof e === "object" && (e as { is_completed?: boolean })?.is_completed === true),
  ).length;
  console.log(`  days completed: ${daysCompleted}`);

  if (userType !== "freev2") {
    console.error(`\n✗ Refusing to flip — user_type is "${userType}", not "freev2". STOP+ is FreeV2-only.`);
    process.exit(1);
  }
  if (currentStage !== expectedCurrent) {
    console.error(
      `\n✗ Refusing to flip — current stage is "${currentStage}", expected "${expectedCurrent}". Not overriding regrowth / maintenance / other stages.`,
    );
    process.exit(1);
  }

  console.log(`\n  Would set treatment_stage → ${targetStage}`);

  if (!write) {
    console.log(`  DRY RUN — pass --write to commit.`);
    return;
  }

  await doc.ref.update({
    treatment_stage: targetStage,
    // Not strictly required for the mobile app but useful for audit
    // trail — when we flipped them, what direction.
    stop_plus_toggled_at: FieldValue.serverTimestamp(),
    stop_plus_last_action: revert ? "revert" : "grant",
  });
  console.log(`  ✔ Updated. User will see STOP+ content on next dashboard open.`);
  if (!revert) {
    console.log(`\n  NOTE: their next dashboard build will re-generate progress.dayN with 5 exercises pulled from FREEV2_MEN_STOPPAGE_PLUS_EXERCISES.`);
    console.log(`  Historical progress.dayN entries stay as-is (they show what they actually did on those days).`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
