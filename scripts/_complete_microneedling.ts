// One-off: simulate microneedling completion for a test user — increments
// the microneedling_sessions_completed counter the same way the in-app
// completion does.
//
// Usage: npx tsx scripts/_complete_microneedling.ts <email>

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: _complete_microneedling.ts <email>");
    process.exit(1);
  }

  const snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const doc = snap.docs[0];
  const before = doc.data() as Record<string, unknown>;
  const beforeCount = (before.microneedling_sessions_completed as number | undefined) ?? 0;
  console.log(`Found user: ${doc.id} (email: ${before.email})`);
  console.log(`Before microneedling_sessions_completed: ${beforeCount}`);

  await doc.ref.update({
    microneedling_sessions_completed: FieldValue.increment(1),
  });

  const after = (await doc.ref.get()).data() as Record<string, unknown>;
  console.log(`After: ${after.microneedling_sessions_completed}`);
  console.log(`✓ Microneedling session marked complete.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
