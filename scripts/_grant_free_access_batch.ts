// One-off: grant free access (open_account) to a list of users by email.
// open_account: true bypasses all subscription/trial gating checks in the
// app — user gets full experience for free forever.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_grant_free_access_batch.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString(),
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAILS = [
  "visitayaanmohan275@gmail.com",
  "shahnoorimahbob@gmail.com",
];

async function grantOne(email: string) {
  console.log(`\n▸ ${email}`);
  // Firestore email fields are case-sensitive; check both.
  let snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    snap = await db.collection("Users").where("email", "==", email.toLowerCase()).limit(1).get();
  }
  if (snap.empty) {
    console.log(`  ✗ no user found (tried both cases)`);
    return;
  }
  const doc = snap.docs[0];
  const uid = doc.id;
  const before = doc.data();
  console.log(`  ✓ UID: ${uid}`);
  console.log(`    open_account (before): ${before.open_account ?? "-"}`);

  await db.collection("Users").doc(uid).update({
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await db.collection("Users").doc(uid).get()).data();
  console.log(`    open_account (after):  ${after!.open_account}`);
}

(async () => {
  for (const email of EMAILS) {
    try {
      await grantOne(email);
    } catch (e) {
      console.error(`  ERR for ${email}:`, (e as Error).message);
    }
  }
  console.log(`\n✓ done.`);
  process.exit(0);
})().catch((e: Error) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
