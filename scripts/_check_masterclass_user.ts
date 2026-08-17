// Dump the masterclass fields on a user's doc so we can diagnose whether
// the Calendly API fetch landed at booking time.
//
// Usage:
//   set -a && source .env.local && set +a
//   EMAIL=test93@test.com npx tsx scripts/_check_masterclass_user.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

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
    console.error("ERR: pass EMAIL=<email>");
    process.exit(1);
  }
  const snap = await db
    .collection("Users")
    .where("email", "==", EMAIL)
    .limit(1)
    .get();
  if (snap.empty) {
    console.error("no user");
    process.exit(1);
  }
  const d = snap.docs[0];
  const x = d.data();
  console.log(`\nUID: ${d.id}\n`);
  const fields = [
    "microneedling_masterclass_booked_at",
    "microneedling_masterclass_calendly_event_uri",
    "microneedling_masterclass_join_url",
    "microneedling_masterclass_event_start_time",
  ];
  for (const f of fields) {
    const v = x[f];
    let display: string;
    if (v == null) display = "(not set)";
    else if (v?.toDate) display = v.toDate().toISOString();
    else display = String(v);
    console.log(`  ${f.padEnd(50)} ${display}`);
  }
  console.log("");
  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
