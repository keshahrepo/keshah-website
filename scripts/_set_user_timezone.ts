// One-shot: flip a user's userLocalTimeZone in Firestore so isIndiaUser
// resolves to true (or back to the original timezone for cleanup).
//
// Usage:
//   npx ts-node scripts/_set_user_timezone.ts <email> <timezone> [--apply]
//
// Examples:
//   Dry-run for India:
//     npx ts-node scripts/_set_user_timezone.ts test76@test.com Asia/Kolkata
//   Apply:
//     npx ts-node scripts/_set_user_timezone.ts test76@test.com Asia/Kolkata --apply
//   Revert to US:
//     npx ts-node scripts/_set_user_timezone.ts test76@test.com America/Los_Angeles --apply

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const email = process.argv[2];
const tz = process.argv[3];
const apply = process.argv.includes("--apply");

if (!email || !tz) {
  console.error("Usage: _set_user_timezone.ts <email> <timezone> [--apply]");
  process.exit(1);
}

(async () => {
  const snap = await db
    .collection("Users")
    .where("wp_user.user_email", "==", email.toLowerCase())
    .limit(1)
    .get();

  if (snap.empty) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const doc = snap.docs[0];
  const data = doc.data();
  const current = data.userLocalTimeZone ?? "(unset)";

  console.log(`Found user ${doc.id} (email: ${email})`);
  console.log(`  Current userLocalTimeZone: ${current}`);
  console.log(`  Target  userLocalTimeZone: ${tz}`);

  if (current === tz) {
    console.log("Already set to target. No change.");
    process.exit(0);
  }

  if (!apply) {
    console.log("\nDRY RUN — add --apply to write.");
    process.exit(0);
  }

  await doc.ref.update({ userLocalTimeZone: tz });
  console.log(`\n✓ updated. Restart the app to pick up the change.`);
  process.exit(0);
})().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("ERR:", msg);
  process.exit(1);
});
