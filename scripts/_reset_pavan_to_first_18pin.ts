// Reset pavanchinna777@gmail.com back to the first 18-pin cartridge session
// (Week 3 of regrowth) so all sessions from there are available again.
//
// Requested by the user in support chat. Currently on regrowth day 55 (week 8).
// Week 3 is the first 18-pin session (18-Pin, 0.75mm — see pin_config_model.dart).
//
// Approach:
//   1. Shift regrowth_switched_at_date backward so today = regrowth day 15
//      (start of week 3). Next 3rd-day-of-week (day 17) will be Session 3.
//   2. Delete regrowth_progress entries for day15..day55 so those days
//      re-generate fresh when he opens the app.
//   3. Keep days 1..14 intact so his early history isn't wiped.
//
// Dry-run by default. Pass APPLY=1 to actually write.
//
// Run:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_reset_pavan_to_first_18pin.ts             # dry-run
//   APPLY=1 npx tsx scripts/_reset_pavan_to_first_18pin.ts     # apply

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");

const EMAIL = "pavanchinna777@gmail.com";
const TARGET_REGROWTH_DAY = 15; // start of week 3 → next session (day 17) is first 18-pin

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

(async () => {
  console.log(
    `\n=== Pavan reset to first 18-pin session — ${APPLY ? "APPLY (writing!)" : "DRY RUN"} ===\n`
  );

  const snap = await db.collection("Users").where("email", "==", EMAIL).get();
  if (snap.empty) {
    console.error(`No user with email ${EMAIL}`);
    process.exit(1);
  }
  if (snap.size > 1) {
    console.error(`Multiple user docs found for ${EMAIL} — aborting to avoid ambiguity.`);
    for (const d of snap.docs) console.error(`  ${d.id}`);
    process.exit(1);
  }
  const doc = snap.docs[0];
  const uid = doc.id;
  const before = doc.data() as any;

  console.log(`▸ uid:                          ${uid}`);
  console.log(`▸ treatment_stage:              ${before.treatment_stage}`);
  console.log(`▸ regrowth_switched_at_date:    ${before.regrowth_switched_at_date}`);
  console.log(
    `▸ regrowth_progress days:       ${
      before.regrowth_progress ? Object.keys(before.regrowth_progress).length : 0
    }`
  );
  const existingDayKeys = Object.keys(before.regrowth_progress ?? {}).sort(
    (a, b) => parseInt(a.replace(/^day/, "")) - parseInt(b.replace(/^day/, ""))
  );
  if (existingDayKeys.length) {
    console.log(`▸ regrowth_progress keys:       ${existingDayKeys.join(", ")}`);
  }

  // New switched-at date = today - (TARGET_REGROWTH_DAY - 1) days
  // → today becomes regrowth day TARGET_REGROWTH_DAY
  const now = new Date();
  const newSwitchedAt = new Date(now);
  newSwitchedAt.setDate(now.getDate() - (TARGET_REGROWTH_DAY - 1));
  const newSwitchedAtStr = ddmmyyyy(newSwitchedAt);

  // Days to delete from progress: TARGET_REGROWTH_DAY onward.
  const daysToDelete = existingDayKeys.filter((k) => {
    const n = parseInt(k.replace(/^day/, ""), 10);
    return n >= TARGET_REGROWTH_DAY;
  });

  console.log(`\n─── plan ───────────────────────────────`);
  console.log(`  new regrowth_switched_at_date: ${newSwitchedAtStr}  (today = regrowth day ${TARGET_REGROWTH_DAY})`);
  console.log(`  next session unlock:           day 17 (Session 3, first 18-Pin 0.75mm)`);
  console.log(`  progress days to delete:       ${daysToDelete.length}${daysToDelete.length ? ` (${daysToDelete.join(", ")})` : ""}`);
  console.log(`  progress days kept:            day1..day${TARGET_REGROWTH_DAY - 1}\n`);

  if (!APPLY) {
    console.log(`DRY RUN — re-run with APPLY=1 to actually write.\n`);
    process.exit(0);
  }

  const update: Record<string, unknown> = {
    regrowth_switched_at_date: newSwitchedAtStr,
    // Clear the celebration marker so unlock celebrations for week 3+ can fire again.
    last_unlock_celebration_day: FieldValue.delete(),
  };
  for (const k of daysToDelete) {
    update[`regrowth_progress.${k}`] = FieldValue.delete();
  }

  await doc.ref.update(update);
  console.log(`✓ Wrote update.`);

  const after = (await doc.ref.get()).data() as any;
  console.log(`\n─── after ─────────────────────────────`);
  console.log(`  regrowth_switched_at_date:    ${after.regrowth_switched_at_date}`);
  const afterKeys = Object.keys(after.regrowth_progress ?? {}).sort(
    (a, b) => parseInt(a.replace(/^day/, "")) - parseInt(b.replace(/^day/, ""))
  );
  console.log(`  regrowth_progress days:       ${afterKeys.length}`);
  console.log(`  regrowth_progress keys:       ${afterKeys.join(", ") || "(none)"}\n`);
  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
