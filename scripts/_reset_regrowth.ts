// Resets a user's regrowth to Day 1 by clearing progress + setting
// regrowth_switched_at_date to today. Keeps consultation status,
// session_day preference, and treatment_stage intact.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = process.argv[2] ?? "muSmg1zxdCdW3KjEUjIMAaf1N1H2";

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

(async () => {
  const ref = db.collection("Users").doc(UID);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`No user at ${UID}`);
    process.exit(1);
  }
  const before = snap.data() as any;
  console.log(`Before:`);
  console.log(`  regrowth_switched_at_date: ${before.regrowth_switched_at_date}`);
  console.log(`  regrowth_progress keys:    ${Object.keys(before.regrowth_progress ?? {}).length}`);
  console.log(`  treatment_stage:           ${before.treatment_stage}`);

  const today = ddmmyyyy(new Date());
  await ref.update({
    regrowth_switched_at_date: today,
    regrowth_progress: FieldValue.delete(),
    last_unlock_celebration_day: FieldValue.delete(),
  });

  const after = (await ref.get()).data() as any;
  console.log(`\nAfter:`);
  console.log(`  regrowth_switched_at_date: ${after.regrowth_switched_at_date}`);
  console.log(`  regrowth_progress keys:    ${Object.keys(after.regrowth_progress ?? {}).length}`);
  console.log(`  treatment_stage:           ${after.treatment_stage}`);
  console.log(`\n✓ Reset complete. User is on Day 1 of Regrowth as of today (${today}).`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
