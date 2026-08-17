// Grant Lori regrowth access. She has her kit already but can't find the
// in-app QR scan flow. Same pattern as Karin — set qr_scanned=true to
// skip that step and unlock regrowth content directly.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_grant_regrowth_lori.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "lharefrazee@swbell.net";

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const CONFIRM_MESSAGE =
  `Hey Lori — you're all set. The QR scan step has been skipped on our end and regrowth sessions are unlocked in your account.\n\n` +
  `Force-close the app fully (swipe up from the app switcher), then reopen. You'll see the microneedling sessions under the Regrowth tab.\n\n` +
  `Quick reminders for your first session:\n\n` +
  `• Start at 0.75mm depth for the first 4 weeks, then move to 1.5mm\n\n` +
  `• 1x per week only — more often causes irritation, not more growth\n\n` +
  `• 2 passthroughs across the whole treatment area (front, temples, crown)\n\n` +
  `• Apply the KESHAH topicals right after — they help with recovery and absorption\n\n` +
  `Let me know if the sessions don't show up after reopening.`;

(async () => {
  console.log(`▸ Looking up user by email: ${EMAIL}`);
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) {
    console.log(`  ✗ no user found`);
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
    regrowth_kit_payment_provider: "admin_grant_kit_received_qr_stuck",
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

  console.log(`\n▸ Sending confirmation message`);
  await db.collection("support").doc(UID).collection("messages").add({
    fromId: "0",
    content: CONFIRM_MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`  ✓ message sent`);

  console.log(`\n✓ ${EMAIL} activated for regrowth. Kit already received, QR skipped.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
