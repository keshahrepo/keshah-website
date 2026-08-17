// One-off: create an AppVersions Firestore doc that forces all users on
// older versions to update. Read by app on splash via AppRepo.getNewVersions
// — if any matching version has required: true, the changelog page is
// shown with canPop: false (no skip).
//
// CRITICAL: only run this AFTER the target version is LIVE and DOWNLOADABLE
// on BOTH App Store and Play Store. Otherwise existing users get a hard
// wall but cannot actually update.
//
// Usage: npx tsx scripts/_require_app_version.ts <versionName>
//   e.g. npx tsx scripts/_require_app_version.ts 5.14.0

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const versionName = (process.argv[2] ?? "").trim();
  if (!versionName) {
    console.error("Usage: _require_app_version.ts <versionName>");
    console.error("  e.g. _require_app_version.ts 5.14.0");
    process.exit(1);
  }

  const docId = `v_${versionName.replace(/\./g, "_")}`;
  const data = {
    versionName,
    id: docId,
    required: true,
    should_notify_user: true,
    target_platform: "both",
    addedAt: Timestamp.now(),
    changelogs: [
      {
        changeLogItemType: "neww",
        title:
          "Regrowth experience redesigned — new tab with weekly microneedling sessions and best-practices guide.",
      },
      {
        changeLogItemType: "neww",
        title:
          "Stop / Maintain modes — switch to a shorter routine once your hair fall has stopped, switch back anytime.",
      },
      {
        changeLogItemType: "neww",
        title: "India regrowth kit available with INR pricing and Razorpay checkout.",
      },
    ],
  };

  await db.collection("AppVersions").doc(docId).set(data);

  const after = (await db.collection("AppVersions").doc(docId).get()).data();
  console.log(`✓ Created AppVersions/${docId}`);
  console.log(`  versionName:        ${after?.versionName}`);
  console.log(`  required:           ${after?.required}`);
  console.log(`  should_notify_user: ${after?.should_notify_user}`);
  console.log(`  target_platform:    ${after?.target_platform}`);
  console.log(``);
  console.log(`All users on versions < ${versionName} will see the hard-wall update screen on next app open.`);
  console.log(`To roll back, delete this doc or set should_notify_user: false.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
