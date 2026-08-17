// Quick sanity check on the masterclass Firestore config.
// Reads Settings/app_general_settings and prints the masterclass fields
// so we can verify the admin write landed with the right field names.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_check_masterclass_config.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.doc("Settings/app_general_settings").get();
  if (!snap.exists) {
    console.log("Settings/app_general_settings does not exist");
    process.exit(1);
  }
  const data = snap.data() || {};
  const fields = [
    "microneedling_masterclass_enabled",
    "microneedling_masterclass_calendly_url",
    "microneedling_masterclass_meet_url",
    "microneedling_masterclass_available_until",
  ];
  console.log("\nMasterclass fields on Settings/app_general_settings:\n");
  for (const f of fields) {
    const v = data[f];
    let display: string;
    if (v == null) display = "(not set)";
    else if (v?.toDate) display = v.toDate().toISOString();
    else display = String(v);
    console.log(`  ${f.padEnd(48)} ${display}`);
  }
  console.log("");
  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
