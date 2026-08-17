// One-off: shift a user's regrowth_switched_at_date back N days so we
// can test session-day behavior without waiting real time.
//
// Usage: npx tsx scripts/_bump_regrowth_date.ts <email> <daysBack>

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  const daysBack = parseInt(process.argv[3] ?? "0", 10);
  if (!email || isNaN(daysBack)) {
    console.error("Usage: _bump_regrowth_date.ts <email> <daysBack>");
    process.exit(1);
  }

  const snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const doc = snap.docs[0];
  const before = doc.data() as Record<string, unknown>;
  const target = new Date();
  target.setDate(target.getDate() - daysBack);
  const newDate = ddmmyyyy(target);

  console.log(`Found user: ${doc.id} (email: ${before.email})`);
  console.log(`Before regrowth_switched_at_date: ${before.regrowth_switched_at_date ?? "(unset)"}`);
  console.log(`Setting to: ${newDate} (${daysBack} days back)`);

  await doc.ref.update({ regrowth_switched_at_date: newDate });

  console.log(`✓ Done. regrowthDay should now compute as ${daysBack + 1}.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
