// Funnel snapshot scoped to users on the +162 build (i.e., users
// who have written founder_story_started_at). Matches the dashboard's
// new-build-cohort logic so we can preview the numbers before the
// Vercel deploy lands.

import { getFirebaseAdmin } from "../lib/firebase-admin";

async function main() {
  const { db } = getFirebaseAdmin();

  const snap = await db
    .collection("Users")
    .select(
      "founder_story_started_at",
      "pinch_test_started_at",
      "results_screenshots_started_at",
      "hair_loss_location",
      "paywall_viewed_at",
      "started_trial",
      "selected_gender",
    )
    .get();

  const total = snap.size;
  let onNewBuild = 0;
  let male = 0, female = 0, maleOnNewBuild = 0, femaleOnNewBuild = 0;
  const s = {
    founder: 0, pinch: 0, results: 0, quiz: 0, paywall: 0, trial: 0,
  };

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.selected_gender === "male") male++;
    if (d.selected_gender === "female") female++;

    const isNew = !!d.founder_story_started_at;
    if (!isNew) continue;
    onNewBuild++;
    if (d.selected_gender === "male") maleOnNewBuild++;
    if (d.selected_gender === "female") femaleOnNewBuild++;

    if (d.founder_story_started_at) s.founder++;
    if (d.pinch_test_started_at) s.pinch++;
    if (d.results_screenshots_started_at) s.results++;
    if (d.hair_loss_location) s.quiz++;
    if (d.paywall_viewed_at) s.paywall++;
    if (d.started_trial) s.trial++;
  }

  const pct = (n: number) => (onNewBuild === 0 ? "n/a" : ((n / onNewBuild) * 100).toFixed(1) + "%");
  console.log(`Total users (all-time):       ${total.toLocaleString()}`);
  console.log(`On build +162 (cohort):       ${onNewBuild.toLocaleString()} (baseline)`);
  console.log(`  Men (of cohort):            ${maleOnNewBuild.toLocaleString()}`);
  console.log(`  Women (of cohort):          ${femaleOnNewBuild.toLocaleString()}`);
  console.log(`\n── Funnel within +162 cohort ──`);
  console.log(`  Founder story started       ${pct(s.founder).padStart(7)}  ${s.founder}`);
  console.log(`  Pinch test started          ${pct(s.pinch).padStart(7)}  ${s.pinch}`);
  console.log(`  Results screenshots started ${pct(s.results).padStart(7)}  ${s.results}`);
  console.log(`  Quiz started                ${pct(s.quiz).padStart(7)}  ${s.quiz}`);
  console.log(`  Paywall viewed              ${pct(s.paywall).padStart(7)}  ${s.paywall}`);
  console.log(`  Trial started               ${pct(s.trial).padStart(7)}  ${s.trial}`);
  console.log(`\n── Overall gender split (all-time) ──`);
  console.log(`  Men:   ${male.toLocaleString()}`);
  console.log(`  Women: ${female.toLocaleString()}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
