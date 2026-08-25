// Why does /dashboard/scalp-check-ins show 0? Two possibilities:
// (a) no real user has reached Day 3+ yet (feature is too new)
// (b) users are reaching Day 3+ but the modal isn't firing / they skip
//
// We can distinguish by counting freeV2 users whose day count is >= 3
// and comparing to how many have scalp_check_answers.

import { getFirebaseAdmin } from "../lib/firebase-admin";

const TEST = /^test\d+@test\.com$/i;

async function main() {
  const { db } = getFirebaseAdmin();

  // All freeV2 users in the stoppage stage. Pull start_date so we can
  // compute their day count.
  const snap = await db
    .collection("Users")
    .where("user_type", "==", "freev2")
    .select("email", "start_date", "treatment_stage", "scalp_check_answers", "created_at")
    .get();

  let total = 0, day3Plus = 0, day6Plus = 0, day13Plus = 0;
  let anyAnswers = 0, testAnswerers = 0, realAnswerers = 0;
  const realDay3PlusNoAnswer: string[] = [];

  const now = Date.now();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (TEST.test(d.email ?? "")) {
      if (d.scalp_check_answers) testAnswerers++;
      continue;
    }
    total++;

    // Skip regrowth-stage users (they don't get the check-in).
    if (d.treatment_stage === "REGROWTH") continue;

    // Compute day from start_date.date (dd/MM/yyyy). No start_date =
    // user hasn't completed onboarding → skip.
    const sd = d.start_date;
    if (!sd?.date) continue;
    const [dd, mm, yyyy] = String(sd.date).split("/").map(Number);
    if (!dd || !mm || !yyyy) continue;
    const startMs = new Date(yyyy, mm - 1, dd).getTime();
    const dayNum = Math.floor((now - startMs) / 86_400_000) + 1;

    if (dayNum >= 3) day3Plus++;
    if (dayNum >= 6) day6Plus++;
    if (dayNum >= 13) day13Plus++;

    if (d.scalp_check_answers) {
      anyAnswers++;
      realAnswerers++;
    } else if (dayNum >= 3) {
      realDay3PlusNoAnswer.push(`${d.email ?? doc.id} (day ${dayNum})`);
    }
  }

  console.log(`FreeV2 users (excl. test):    ${total}`);
  console.log(`  Reached Day 3+:             ${day3Plus}`);
  console.log(`  Reached Day 6+:             ${day6Plus}`);
  console.log(`  Reached Day 13+:            ${day13Plus}`);
  console.log(`\n  Answered any check-in:      ${realAnswerers} real  (${testAnswerers} test excluded)`);
  console.log(`\n  Reached Day 3+ but no answer: ${realDay3PlusNoAnswer.length}`);
  console.log(`    Sample (first 15):`);
  for (const e of realDay3PlusNoAnswer.slice(0, 15)) console.log(`      - ${e}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
