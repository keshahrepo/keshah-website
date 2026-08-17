// Grant Adam regrowth access.
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_grant_regrowth_adam.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "AdamJaredHall@gmail.com";

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

(async () => {
  console.log(`▸ Looking up user by email: ${EMAIL}`);
  // Try both exact and lowercase since Firestore email fields are case-sensitive
  let snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) {
    snap = await db.collection("Users").where("email", "==", EMAIL.toLowerCase()).limit(1).get();
  }
  if (snap.empty) {
    console.log(`  ✗ no user found for ${EMAIL} (tried both cases)`);
    process.exit(1);
  }
  const doc = snap.docs[0];
  const UID = doc.id;
  const before = doc.data();
  console.log(`  ✓ found UID: ${UID}`);

  console.log(`\n  Before:`);
  console.log(`    treatment_stage:              ${before.treatment_stage ?? "-"}`);
  console.log(`    regrowth_treatment_purchased: ${before.regrowth_treatment_purchased ?? "-"}`);
  console.log(`    open_account:                 ${before.open_account ?? "-"}`);
  console.log(`    qr_scanned:                   ${before.qr_scanned ?? "-"}`);

  const today = ddmmyyyy(new Date());
  await db.collection("Users").doc(UID).update({
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: today,
    regrowth_treatment_purchased: true,
    regrowth_kit_paid_at: FieldValue.serverTimestamp(),
    regrowth_kit_payment_provider: "admin_grant",
    qr_scanned: true,
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await db.collection("Users").doc(UID).get()).data();
  console.log(`\n  After:`);
  console.log(`    treatment_stage:              ${after!.treatment_stage}`);
  console.log(`    regrowth_switched_at_date:    ${after!.regrowth_switched_at_date}`);
  console.log(`    regrowth_treatment_purchased: ${after!.regrowth_treatment_purchased}`);
  console.log(`    qr_scanned:                   ${after!.qr_scanned}`);
  console.log(`    open_account:                 ${after!.open_account}`);

  console.log(`\n✓ ${EMAIL} activated for regrowth.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
