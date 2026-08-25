// One-shot analytical snapshot — pulls the meaningful cuts from the
// +162 cohort so we can pattern-match without staring at a dashboard.

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const CUTOFF = Timestamp.fromDate(new Date("2026-08-18T00:00:00Z"));
const TEST = /^test\d+@test\.com$/i;

async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Users").where("created_at", ">=", CUTOFF).get();

  const users = snap.docs
    .map((d) => d.data())
    .filter((d) => !TEST.test((d.email ?? "") as string));

  const cohort = users.filter((d) => !!d.founder_story_started_at);
  const N = cohort.length;
  const men = cohort.filter((d) => d.selected_gender === "male").length;
  const women = cohort.filter((d) => d.selected_gender === "female").length;

  const pinch = cohort.filter((d) => d.pinch_test_answer).length;
  const results = cohort.filter((d) => d.results_screenshots_started_at).length;
  const quiz = cohort.filter((d) => d.hair_loss_location).length;
  const paywall = cohort.filter((d) => d.paywall_viewed_at).length;
  const trial = cohort.filter((d) => d.started_trial).length;

  const tier1 = cohort.filter((d) => d.country_tier === "tier_1").length;
  const tier2 = cohort.filter((d) => d.country_tier === "tier_2").length;

  const tier1Trial = cohort.filter((d) => d.country_tier === "tier_1" && d.started_trial).length;
  const tier2Trial = cohort.filter((d) => d.country_tier === "tier_2" && d.started_trial).length;

  const pct = (n: number, d: number) => (d === 0 ? "n/a" : ((n / d) * 100).toFixed(1) + "%");

  console.log(`\n═══ Cohort: users on +162 since Aug 18 ═══`);
  console.log(`  N = ${N}  (${men} men, ${women} women, ${N - men - women} unknown gender)`);
  console.log(`  Country: ${tier1} tier-1, ${tier2} tier-2`);

  console.log(`\n═══ Funnel ═══`);
  console.log(`  Founder story started     ${N.toString().padStart(4)}   (baseline)`);
  console.log(`  Pinch test done           ${pinch.toString().padStart(4)}   ${pct(pinch, N)}`);
  console.log(`  Results screenshots seen  ${results.toString().padStart(4)}   ${pct(results, N)}`);
  console.log(`  Quiz started              ${quiz.toString().padStart(4)}   ${pct(quiz, N)}`);
  console.log(`  Paywall viewed            ${paywall.toString().padStart(4)}   ${pct(paywall, N)}`);
  console.log(`  Trial started             ${trial.toString().padStart(4)}   ${pct(trial, N)}`);

  console.log(`\n═══ Country funnel ═══`);
  console.log(`  Tier-1: ${tier1} reached founder story → ${tier1Trial} started trial  (${pct(tier1Trial, tier1)})`);
  console.log(`  Tier-2: ${tier2} reached founder story → ${tier2Trial} started trial  (${pct(tier2Trial, tier2)})`);

  // Answer breakdowns for the questions that matter for targeting
  function bucket(field: string, label: string) {
    const filled = cohort.filter((d) => d[field]);
    const distinct: Record<string, number> = {};
    for (const d of filled) {
      const v = String(d[field]);
      distinct[v] = (distinct[v] ?? 0) + 1;
    }
    const trialCounts: Record<string, number> = {};
    for (const d of filled.filter((d) => d.started_trial)) {
      const v = String(d[field]);
      trialCounts[v] = (trialCounts[v] ?? 0) + 1;
    }
    console.log(`\n─ ${label}  (${filled.length} answered)`);
    const rows = Object.entries(distinct).sort((a, b) => b[1] - a[1]);
    for (const [v, n] of rows) {
      const t = trialCounts[v] ?? 0;
      const overallPct = ((n / filled.length) * 100).toFixed(0);
      const trialPct = t > 0 ? `  starters: ${t}/${trial} (${((t / trial) * 100).toFixed(0)}%)` : "";
      console.log(`    ${v.padEnd(30)} ${n.toString().padStart(3)}  (${overallPct.padStart(3)}%)${trialPct}`);
    }
  }

  bucket("selected_gender", "Gender");
  bucket("referral_source", "Referral source");
  bucket("pinch_test_answer", "Pinch test result");
  bucket("hair_loss_location", "Where losing hair");
  bucket("family_history_men", "Family history");
  bucket("stress_contribution", "Stress contribution");
  bucket("hardest_part", "Hardest part");
  bucket("hair_goal", "Hair goal (men)");
  bucket("country_tier", "Country tier");
}

main().catch((e) => { console.error(e); process.exit(1); });
