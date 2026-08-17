// Pavan restart — reset regrowth cycle to Day 1 today (Option A).
// His first microneedling session will appear on regrowthDay 3 (June 17).

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT||"","base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "HtT6wjiACrZhhXMn2ppGoNJoPSs1";

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  if (!snap.exists) { console.log("✗ no doc"); process.exit(1); }
  const before:any = snap.data();

  const rp = before.regrowth_progress || {};
  const dayKeys = Object.keys(rp).filter(k => /^day\d+$/.test(k));
  console.log(`▸ Pre-state:`);
  console.log(`    regrowth_switched_at_date: ${before.regrowth_switched_at_date}`);
  console.log(`    regrowth_progress entries: ${dayKeys.length}`);
  const completed = dayKeys.filter(k => {
    const entry = rp[k];
    return Array.isArray(entry) && entry.some((e:any) => e?.is_completed === true);
  }).length;
  console.log(`    days with completions:     ${completed}`);

  const today = new Date();
  const dd = String(today.getUTCDate()).padStart(2,"0");
  const mm = String(today.getUTCMonth()+1).padStart(2,"0");
  const yyyy = today.getUTCFullYear();
  const newDate = `${dd}/${mm}/${yyyy}`;

  console.log(`\n▸ Updating regrowth_switched_at_date → ${newDate}`);
  console.log(`▸ Clearing regrowth_progress (${dayKeys.length} days)`);

  await ref.update({
    regrowth_switched_at_date: newDate,
    regrowth_progress: FieldValue.delete(),
    modified_at: FieldValue.serverTimestamp(),
  });

  const after:any = (await ref.get()).data();
  console.log(`\n▸ Post-state:`);
  console.log(`    regrowth_switched_at_date: ${after.regrowth_switched_at_date}`);
  console.log(`    regrowth_progress entries: ${after.regrowth_progress ? Object.keys(after.regrowth_progress).length : 0}`);

  console.log(`\n✓ Done. Pavan is regrowthDay 1 today. First microneedling session on Day 3 (in 2 days = ${new Date(Date.now()+2*86400_000).toISOString().slice(0,10)}).`);
  console.log(`  Ask him to fully close + reopen the app to see the reset.`);
})();
