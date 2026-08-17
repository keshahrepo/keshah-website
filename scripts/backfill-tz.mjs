// Backfill userLocalTimeZone for users who got Asia/Kolkata stamped
// because the save-profile route hardcoded IST before we shipped the
// browser-timezone fix. Affected = US-funnel payers (rc_billing).
//
// Run:
//   set -a && source .env.local && set +a
//   node scripts/backfill-tz.mjs            # dry run
//   node scripts/backfill-tz.mjs --apply    # write

import admin from "firebase-admin";

const DRY_RUN = !process.argv.includes("--apply");

const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
let serviceAccount;
try { serviceAccount = JSON.parse(raw); }
catch { serviceAccount = JSON.parse(Buffer.from(raw, "base64").toString("utf-8")); }
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
const db = admin.firestore();

console.log(`Mode: ${DRY_RUN ? "DRY RUN" : "APPLY"}`);

// Filter: paid US users (rc_billing) with the wrong tz stamped.
const snap = await db
  .collection("Users")
  .where("payment_provider", "==", "rc_billing")
  .where("userLocalTimeZone", "==", "Asia/Kolkata")
  .get();

console.log(`Found ${snap.size} affected users`);

let processed = 0, errors = 0;
const BATCH = 50;

for (let i = 0; i < snap.docs.length; i += BATCH) {
  const batch = snap.docs.slice(i, i + BATCH);
  await Promise.allSettled(batch.map(async (doc) => {
    const d = doc.data();
    try {
      if (DRY_RUN) {
        console.log(`[DRY] ${doc.id.padEnd(28)} ${(d.email || "-").padEnd(40)} -> America/New_York`);
      } else {
        await doc.ref.update({ userLocalTimeZone: "America/New_York" });
        console.log(`[OK ] ${doc.id.padEnd(28)} ${(d.email || "-").padEnd(40)} -> America/New_York`);
      }
      processed++;
    } catch (e) {
      console.error(`[ERR] ${doc.id}: ${e.message ?? e}`);
      errors++;
    }
  }));
}

console.log(`\nProcessed: ${processed}, Errors: ${errors}`);
process.exit(errors > 0 ? 1 : 0);
