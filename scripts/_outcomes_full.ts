import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // Full cohort with start_date — no date filter
  const snap = await db.collection("Users").where("start_date", "!=", null).get();
  const users = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total non-deleted users with start_date: ${users.length}`);

  const now = Date.now();
  const DAY_MS = 86_400_000;

  let eligibleDay60 = 0;
  let checkInDay60 = 0;
  let eligibleDay90 = 0;
  let checkInDay90 = 0;
  let stoppageReported = 0;
  let stabilizationConfirmed = 0;
  let stoppageReportedOfEligible60 = 0;

  for (const d of users) {
    const data = d.data();
    const createdAt = data.created_at?.toDate?.();
    if (!createdAt) continue;
    const ageDays = Math.floor((now - createdAt.getTime()) / DAY_MS);

    if (ageDays >= 60) {
      eligibleDay60++;
      if (data.check_in_day_60_completed === true) checkInDay60++;
      if (data.hair_loss_stoppage_reported_at) stoppageReportedOfEligible60++;
    }
    if (ageDays >= 90) {
      eligibleDay90++;
      if (data.check_in_day_90_completed === true) checkInDay90++;
    }

    if (data.hair_loss_stoppage_reported_at) stoppageReported++;
    if (data.stabilization_confirmed === true) stabilizationConfirmed++;
  }

  console.log(`\n=== Day 60 check-in ===`);
  console.log(`  Eligible (60+ days old):              ${eligibleDay60}`);
  console.log(`  Completed Day 60 check-in:            ${checkInDay60}  (${Math.round(checkInDay60/eligibleDay60*100)}% of eligible)`);
  console.log(`  Reported stoppage:                    ${stoppageReportedOfEligible60}  (${Math.round(stoppageReportedOfEligible60/eligibleDay60*100)}% of eligible)`);
  console.log(`  Stoppage rate among check-in doers:   ${Math.round(stoppageReportedOfEligible60/checkInDay60*100)}% (${stoppageReportedOfEligible60}/${checkInDay60})`);

  console.log(`\n=== Day 90 check-in ===`);
  console.log(`  Eligible (90+ days old):              ${eligibleDay90}`);
  console.log(`  Completed Day 90 check-in:            ${checkInDay90}  (${Math.round(checkInDay90/eligibleDay90*100)}% of eligible)`);

  console.log(`\n=== Lifetime totals ===`);
  console.log(`  Stoppage reported (any time):         ${stoppageReported}`);
  console.log(`  Stabilization confirmed:              ${stabilizationConfirmed}`);

  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
