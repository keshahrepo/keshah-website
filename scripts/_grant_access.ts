// One-off: bypass the paywall for a user by setting open_account=true.
// Read in free_trial_v2_page.dart line 373 — short-circuits the trial
// paywall for FreeV2 users.
//
// Usage: npx tsx scripts/_grant_access.ts <email> [<email2> ...]

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function grant(email: string) {
  const e = email.trim().toLowerCase();
  const snap = await db.collection("Users").where("email", "==", e).limit(1).get();
  if (snap.empty) {
    console.log(`❌ ${e} — no user doc found, can't grant access. They need to sign up first.`);
    return;
  }
  const doc = snap.docs[0];
  await doc.ref.update({
    open_account: true,
    modified_at: FieldValue.serverTimestamp(),
  });
  console.log(`✓ ${e} — open_account: true (uid: ${doc.id})`);
}

(async () => {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error("Usage: _grant_access.ts <email> [<email2> ...]");
    process.exit(1);
  }
  for (const e of emails) {
    await grant(e);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
