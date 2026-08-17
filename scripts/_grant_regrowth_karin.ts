// Grant Karin regrowth access. She's a Stripe payer whose webhook
// didn't fire, so `regrowth_treatment_purchased` is still false even
// though she has the physical kit. Also she couldn't figure out the
// in-app scan flow. Manually set the fields so her account matches
// her actual paid status.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_grant_regrowth_karin.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "karineavi@gmail.com";
const UID = "g05xU0ahTRMXat9Q8KBpV9ZZVIh1";

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
  console.log(`    qr_scanned:                   ${before.qr_scanned ?? "-"}`);

  const today = ddmmyyyy(new Date());
  await ref.update({
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: today,
    regrowth_treatment_purchased: true,
    regrowth_kit_paid_at: FieldValue.serverTimestamp(),
    regrowth_kit_payment_provider: "admin_grant_stripe_webhook_missed",
    qr_scanned: true,
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await ref.get()).data();
  console.log(`\n  After:`);
  console.log(`    treatment_stage:              ${after!.treatment_stage}`);
  console.log(`    regrowth_switched_at_date:    ${after!.regrowth_switched_at_date}`);
  console.log(`    regrowth_treatment_purchased: ${after!.regrowth_treatment_purchased}`);
  console.log(`    qr_scanned:                   ${after!.qr_scanned}`);
  console.log(`    open_account:                 ${after!.open_account}`);
  console.log(`\n✓ ${EMAIL} activated for regrowth. Kit already received.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
