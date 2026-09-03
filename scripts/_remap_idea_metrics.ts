// Remap every idea's target_metric to one of the 4 pipeline metrics
// (funnel_trial_started, perday_day1, perday_day2, outcome_converted).
// Best-effort mapping based on intent, defaulting to null when no
// pipeline metric fits.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Legacy metric key → new pipeline metric key (or null if no fit)
const REMAP: Record<string, string | null> = {
  // Already fits
  funnel_trial_started: "funnel_trial_started",
  perday_day1: "perday_day1",
  perday_day2: "perday_day2",
  outcome_converted: "outcome_converted",

  // Best-effort legacy → new
  funnel_started: "funnel_trial_started",   // trial-start rate
  funnel_day_gte_1: "perday_day1",          // did at least 1 day → same as Day 1 start
  funnel_day_gte_3: "outcome_converted",    // downstream retention → paid
  funnel_day_gte_5: "outcome_converted",
  funnel_day_all: "outcome_converted",      // finished all 7 days → most convert
  funnel_converted: "outcome_converted",
  outcome_cancelled: "outcome_converted",   // inverse but same territory
  outcome_still_in_trial: "outcome_converted",

  // Deeper days → closest early-day proxy (still fits the "return on Day N" narrative)
  perday_day3: "perday_day2",
  perday_day4: "perday_day2",
  perday_day5: "perday_day2",
  perday_day6: "perday_day2",
  perday_day7: "outcome_converted",

  // Onboarding funnel intermediate stages → install to trial
  funnel_founder_started: "funnel_trial_started",
  funnel_pinch_started: "funnel_trial_started",
  funnel_results_started: "funnel_trial_started",
  funnel_quiz_started: "funnel_trial_started",
  funnel_paywall_viewed: "funnel_trial_started",
};

async function main() {
  const snap = await db.collection("Ideas").get();
  let touched = 0;
  let nulled = 0;
  for (const doc of snap.docs) {
    const d = doc.data();
    const current = d.target_metric as string | null | undefined;
    if (!current) continue;
    if (!(current in REMAP)) {
      console.log(`? no mapping for ${doc.id} → ${current} — setting null`);
      await doc.ref.set({ target_metric: null, updated_at: FieldValue.serverTimestamp() }, { merge: true });
      nulled++;
      continue;
    }
    const next = REMAP[current];
    if (next === current) continue;
    await doc.ref.set({ target_metric: next, updated_at: FieldValue.serverTimestamp() }, { merge: true });
    console.log(`✓ ${doc.id}: ${current} → ${next ?? "null"}`);
    touched++;
    if (next === null) nulled++;
  }
  console.log(`\n${touched} ideas updated, ${nulled} nulled.`);
}
main().catch(e => { console.error(e); process.exit(1); });
