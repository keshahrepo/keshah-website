// Reset a user's masterclass booking state so they see the "book your
// seat" banner again. Use for testing the full flow end-to-end.
//
// Usage:
//   set -a && source .env.local && set +a
//   EMAIL=test93@test.com npx tsx scripts/_reset_masterclass_booking.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = process.env.EMAIL || process.argv[2];

(async () => {
  if (!EMAIL) {
    console.error("ERR: pass EMAIL=<email> or as first arg");
    process.exit(1);
  }
  console.log(`▸ Looking up user by email: ${EMAIL}`);
  const snap = await db
    .collection("Users")
    .where("email", "==", EMAIL)
    .limit(1)
    .get();
  if (snap.empty) {
    console.error(`  ✗ no user with that email`);
    process.exit(1);
  }
  const doc = snap.docs[0];
  const uid = doc.id;
  const before = doc.data();

  console.log(`  ✓ found UID: ${uid}\n`);
  console.log(`  Before:`);
  console.log(
    `    microneedling_masterclass_booked_at:            ${before.microneedling_masterclass_booked_at ?? "(not set)"}`
  );
  console.log(
    `    microneedling_masterclass_calendly_event_uri:   ${before.microneedling_masterclass_calendly_event_uri ?? "(not set)"}`
  );

  await db.collection("Users").doc(uid).update({
    microneedling_masterclass_booked_at: FieldValue.delete(),
    microneedling_masterclass_calendly_event_uri: FieldValue.delete(),
  });

  console.log(`\n  ✓ Reset. User will now see the "Book your seat" banner again on next app refresh.`);
  console.log(`  Force-close and reopen the app.`);
  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
