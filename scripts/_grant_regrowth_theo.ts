// Theo (theodubreuil@hotmail.fr) — Day 189 REGROWTH user reporting he can't see
// regrowth pen sessions anymore. Everything else looks right, just missing the
// two gating fields (qr_scanned, open_account) that the current app requires.
//
// Same pattern as _grant_regrowth_lori.ts / _grant_regrowth_adam.ts.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_grant_regrowth_theo.ts           # dry-run
//   npx tsx scripts/_grant_regrowth_theo.ts --apply   # fix + confirm

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "theodubreuil@hotmail.fr";
const APPLY = process.argv.includes("--apply");

const CONFIRM_MESSAGE =
  `Hey Theo — access is unlocked on our end. Force-close the app fully (swipe up from the app switcher) and reopen. ` +
  `Your regrowth microneedling sessions should be back on the Regrowth tab.\n\n` +
  `Let me know if they don't show up.`;

(async () => {
  console.log(`▸ Lookup: ${EMAIL}`);
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) { console.log("  ✗ not found"); process.exit(1); }
  const UID = snap.docs[0].id;
  const u = snap.docs[0].data() as any;

  console.log(`  ✓ UID: ${UID}`);
  console.log(`  Before:`);
  console.log(`    treatment_stage:              ${u.treatment_stage}`);
  console.log(`    regrowth_treatment_purchased: ${u.regrowth_treatment_purchased}`);
  console.log(`    qr_scanned:                   ${u.qr_scanned ?? "(not set)"}`);
  console.log(`    open_account:                 ${u.open_account ?? "(not set)"}`);

  if (!APPLY) {
    console.log(`\n(dry-run — pass --apply to write)`);
    process.exit(0);
  }

  await db.collection("Users").doc(UID).update({
    qr_scanned: true,
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });
  const after = (await db.collection("Users").doc(UID).get()).data();
  console.log(`  After:`);
  console.log(`    qr_scanned:                   ${after!.qr_scanned}`);
  console.log(`    open_account:                 ${after!.open_account}`);

  await db.collection("support").doc(UID).collection("messages").add({
    fromId: "0", content: CONFIRM_MESSAGE, attachments: null, feedback: null,
    type: "direct", timestamp: Timestamp.now(),
  });
  console.log(`  ✓ Confirmation message sent`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
