// Grant regrowth session access to Mattia — owns his own microneedling pen,
// doesn't want to pay $495 for the kit. Same "admin_grant_owns_pen" pattern
// as the previous user.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_grant_regrowth_mattia.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "sgkkgqxgnn@privaterelay.appleid.com";

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

const CONFIRM_MESSAGE =
  `Hey Mattia — you're all set. Regrowth sessions are unlocked.\n\n` +
  `Reopen the app (force-close first if it's already open) and you'll see the microneedling session content under the Regrowth tab.\n\n` +
  `Quick reminders on the routine:\n\n` +
  `• 1x per week is enough — don't do it more often\n\n` +
  `• Depth: start at 0.75mm for the first 4 weeks, then move to 1.5mm\n\n` +
  `• 2 passthroughs across the whole treatment area (front, temples, crown)\n\n` +
  `• After microneedling, apply KESHAH topicals — since you're not using ours, use whatever clean scalp serum you have (rosemary, saw palmetto, castor oil all fine). Just no minoxidil the day of.\n\n` +
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

  const today = ddmmyyyy(new Date());
  await db.collection("Users").doc(UID).update({
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: today,
    regrowth_treatment_purchased: true,
    regrowth_kit_paid_at: FieldValue.serverTimestamp(),
    regrowth_kit_payment_provider: "admin_grant_owns_pen",
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await db.collection("Users").doc(UID).get()).data();
  console.log(`\n  After:`);
  console.log(`    treatment_stage:              ${after!.treatment_stage}`);
  console.log(`    regrowth_switched_at_date:    ${after!.regrowth_switched_at_date}`);
  console.log(`    regrowth_treatment_purchased: ${after!.regrowth_treatment_purchased}`);
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

  console.log(`\n✓ ${EMAIL} activated for regrowth. Owns pen, no kit needed.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
