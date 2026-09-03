// Quick paid-vs-organic breakdown for the +162 signup cohort so we can
// tell at a glance how the paid ads are actually performing vs the
// baseline organic funnel.
//
// Usage: npx tsx scripts/_paid_vs_organic.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Same cutoff the /dashboard/onboarding and /dashboard/trial pages use
// so numbers here match what he'd see in the admin UI.
const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

const TEST_EMAIL = /^test\d+@test\.com$/i;

type Bucket = {
  signups: number;
  founderStoryStarted: number;
  pinchTestStarted: number;
  resultsStarted: number;
  quizStarted: number;
  paywallViewed: number;
  trialStarted: number;
  convertedTrial: number;
  cancelled: number;
  tier1: number;
  tier2: number;
};

const empty = (): Bucket => ({
  signups: 0,
  founderStoryStarted: 0,
  pinchTestStarted: 0,
  resultsStarted: 0,
  quizStarted: 0,
  paywallViewed: 0,
  trialStarted: 0,
  convertedTrial: 0,
  cancelled: 0,
  tier1: 0,
  tier2: 0,
});

async function main() {
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select(
      "install_source",
      "started_trial",
      "converted_trial",
      "subscription_status",
      "founder_story_started_at",
      "pinch_test_started_at",
      "results_screenshots_started_at",
      "hair_loss_location",
      "paywall_viewed_at",
      "country_tier",
      "email",
      "is_deleted",
    )
    .get();

  const paid = empty();
  const organic = empty();

  for (const doc of snap.docs) {
    const d = doc.data() as Record<string, unknown>;
    if (d.is_deleted) continue;
    if (typeof d.email === "string" && TEST_EMAIL.test(d.email)) continue;

    // "paid" only when explicitly labelled paid; everything else
    // (organic, unknown, missing) counts as organic — same rule the
    // dashboards use.
    const bucket = d.install_source === "paid" ? paid : organic;

    bucket.signups++;
    if (d.founder_story_started_at) bucket.founderStoryStarted++;
    if (d.pinch_test_started_at) bucket.pinchTestStarted++;
    if (d.results_screenshots_started_at) bucket.resultsStarted++;
    if (d.hair_loss_location && d.founder_story_started_at) bucket.quizStarted++;
    if (d.paywall_viewed_at) bucket.paywallViewed++;
    if (d.started_trial) bucket.trialStarted++;
    if (d.converted_trial) bucket.convertedTrial++;
    if (d.subscription_status === "cancelled") bucket.cancelled++;
    if (d.country_tier === "tier_1") bucket.tier1++;
    if (d.country_tier === "tier_2") bucket.tier2++;
  }

  const pct = (n: number, d: number) =>
    d === 0 ? "  —" : `${((n / d) * 100).toFixed(1).padStart(4)}%`;

  const printCohort = (name: string, b: Bucket) => {
    console.log(`\n══ ${name.padEnd(8)} ══`);
    console.log(`  signups             ${b.signups.toString().padStart(5)}`);
    console.log(`  founder started     ${b.founderStoryStarted.toString().padStart(5)}  ${pct(b.founderStoryStarted, b.signups)}`);
    console.log(`  pinch started       ${b.pinchTestStarted.toString().padStart(5)}  ${pct(b.pinchTestStarted, b.signups)}`);
    console.log(`  results shown       ${b.resultsStarted.toString().padStart(5)}  ${pct(b.resultsStarted, b.signups)}`);
    console.log(`  quiz started        ${b.quizStarted.toString().padStart(5)}  ${pct(b.quizStarted, b.signups)}`);
    console.log(`  paywall viewed      ${b.paywallViewed.toString().padStart(5)}  ${pct(b.paywallViewed, b.signups)}`);
    console.log(`  trial started       ${b.trialStarted.toString().padStart(5)}  ${pct(b.trialStarted, b.signups)}`);
    console.log(`  converted trial     ${b.convertedTrial.toString().padStart(5)}  ${pct(b.convertedTrial, b.trialStarted)} of trials`);
    console.log(`  cancelled           ${b.cancelled.toString().padStart(5)}  ${pct(b.cancelled, b.trialStarted)} of trials`);
    console.log(`  ── country ──`);
    console.log(`  tier_1              ${b.tier1.toString().padStart(5)}  ${pct(b.tier1, b.signups)}`);
    console.log(`  tier_2              ${b.tier2.toString().padStart(5)}  ${pct(b.tier2, b.signups)}`);
  };

  printCohort("PAID", paid);
  printCohort("ORGANIC", organic);

  // Head-to-head deltas — the answer to "is paid worth it?"
  console.log(`\n══ HEAD-TO-HEAD  (paid rate vs organic rate) ══`);
  const delta = (label: string, pn: number, pd: number, on: number, od: number) => {
    const pRate = pd === 0 ? 0 : (pn / pd) * 100;
    const oRate = od === 0 ? 0 : (on / od) * 100;
    const diff = pRate - oRate;
    const arrow = diff > 0.5 ? "↑" : diff < -0.5 ? "↓" : "~";
    console.log(
      `  ${label.padEnd(24)}  paid ${pRate.toFixed(1).padStart(4)}%  vs  org ${oRate.toFixed(1).padStart(4)}%   ${arrow} ${diff > 0 ? "+" : ""}${diff.toFixed(1)}pp`,
    );
  };
  delta("founder → pinch",       paid.pinchTestStarted, paid.founderStoryStarted, organic.pinchTestStarted, organic.founderStoryStarted);
  delta("pinch → paywall",       paid.paywallViewed, paid.pinchTestStarted, organic.paywallViewed, organic.pinchTestStarted);
  delta("signup → paywall view", paid.paywallViewed, paid.signups, organic.paywallViewed, organic.signups);
  delta("paywall → trial start", paid.trialStarted, paid.paywallViewed, organic.trialStarted, organic.paywallViewed);
  delta("signup → trial start",  paid.trialStarted, paid.signups, organic.trialStarted, organic.signups);
  delta("trial → converted",     paid.convertedTrial, paid.trialStarted, organic.convertedTrial, organic.trialStarted);
  delta("signup → converted",    paid.convertedTrial, paid.signups, organic.convertedTrial, organic.signups);

  console.log(`\n(cohort: signups since ${RELEASE_CUTOFF.toISOString().slice(0,10)}, test emails excluded, install_source ≠ "paid" → organic)\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
