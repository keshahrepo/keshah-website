// For each of the 7 users who have started_trial set, dump the
// signals that decide whether the onboarding-call prompt was shown
// and whether they booked.

import { getFirebaseAdmin } from "../lib/firebase-admin";

async function main() {
  const { db } = getFirebaseAdmin();

  const snap = await db.collection("Users").where("started_trial", "!=", null).get();
  console.log(`Found ${snap.size} users with started_trial\n`);

  for (const doc of snap.docs) {
    const d = doc.data();
    const startedAt = d.started_trial?.at?.toDate?.()?.toISOString?.() ?? "?";
    console.log(`─── ${d.email ?? doc.id} ───`);
    console.log(`  started_trial.at:              ${startedAt}`);
    console.log(`  started_trial.source:          ${d.started_trial?.source ?? "?"}`);
    console.log(`  country_tier:                  ${d.country_tier ?? "MISSING"}`);
    console.log(`  userLocalTimeZone:             ${d.userLocalTimeZone ?? "MISSING"}`);
    console.log(`  eligible_for_special_regrowth: ${d.eligible_for_special_regrowth_features ?? "MISSING"}`);
    console.log(`  ── Onboarding-call fields`);
    console.log(`  onboarding_call_scheduled_start: ${d.onboarding_call_scheduled_start ? "BOOKED (" + d.onboarding_call_scheduled_start.toDate().toISOString() + ")" : "not booked"}`);
    console.log(`  onboarding_call_join_url:      ${d.onboarding_call_join_url ?? "-"}`);
    console.log();
  }

  // Also check the current feature flag state.
  const s = await db.doc("Settings/app_general_settings").get();
  const sd = s.data() ?? {};
  console.log(`Feature flag: onboarding_call_post_purchase_enabled = ${sd.onboarding_call_post_purchase_enabled}`);
  console.log(`Feature flag: onboarding_call_post_purchase_calendly_url = ${sd.onboarding_call_post_purchase_calendly_url ?? "MISSING"}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
