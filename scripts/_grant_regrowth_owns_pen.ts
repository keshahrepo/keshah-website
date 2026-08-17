// Grant free regrowth session access to a user who already owns a
// microneedling pen and just wants the tutorial content — no kit
// purchase required.
//
// Sets:
//   treatment_stage = "REGROWTH"
//   regrowth_switched_at_date = today (DD/MM/YYYY)
//   regrowth_treatment_purchased = true    (unlocks kit-gated content)
//   open_account = true                    (paywall bypass)
//   regrowth_kit_payment_provider = "admin_grant_owns_pen" (audit trail)
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_grant_regrowth_owns_pen.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "5zdd8k2dsc@privaterelay.appleid.com";
const UID = "7uRewZmsQiVPbbwOYzShd3YXkab2";

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

(async () => {
  console.log(`▸ Firestore update for ${EMAIL}`);
  const ref = db.collection("Users").doc(UID);
  const before = (await ref.get()).data();
  if (!before) {
    console.log(`  ✗ no doc at ${UID}`);
    process.exit(1);
  }

  console.log(`  Before:`);
  console.log(`    treatment_stage:              ${before.treatment_stage ?? "-"}`);
  console.log(`    regrowth_treatment_purchased: ${before.regrowth_treatment_purchased ?? "-"}`);
  console.log(`    open_account:                 ${before.open_account ?? "-"}`);

  const today = ddmmyyyy(new Date());
  await ref.update({
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: today,
    regrowth_treatment_purchased: true,
    regrowth_kit_paid_at: FieldValue.serverTimestamp(),
    regrowth_kit_payment_provider: "admin_grant_owns_pen",
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data();
  console.log(`\n  After:`);
  console.log(`    treatment_stage:              ${after!.treatment_stage}`);
  console.log(`    regrowth_switched_at_date:    ${after!.regrowth_switched_at_date}`);
  console.log(`    regrowth_treatment_purchased: ${after!.regrowth_treatment_purchased}`);
  console.log(`    open_account:                 ${after!.open_account}`);
  console.log(`\n✓ ${EMAIL} granted regrowth session access.`);
  console.log(`  They'll see regrowth content after next app launch.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
