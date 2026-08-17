import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Verify the "surprise" finding — is neck_stretches_07 actually
// present in Day 9 / 12 / 14 / 15, or is there some other gating
// field on the array items that I missed?
(async () => {
  // 1. Dump the full neck_stretches_07 model doc to confirm what it is
  console.log(`\n=== Free_Exercise_Models/neck_stretches_07 (raw) ===`);
  const modelSnap = await db.collection("Free_Exercise_Models").doc("neck_stretches_07").get();
  if (!modelSnap.exists) {
    console.log("(missing)");
  } else {
    console.log(JSON.stringify(modelSnap.data(), null, 2));
  }

  // 2. Dump the FULL raw exercises array from Day 9 (should contain
  //    neck_stretches_07 per earlier discovery — need to see if there
  //    are extra fields like unlock day, advanced, etc.)
  console.log(`\n=== Free_Exercise_List/Day9 (raw exercises array) ===`);
  const daySnap = await db.collection("Free_Exercise_List").doc("Day9").get();
  if (!daySnap.exists) {
    console.log("(missing)");
  } else {
    console.log(JSON.stringify(daySnap.data(), null, 2));
  }

  // 3. Also dump Day 16 for comparison — this is where neck_presses_05
  //    should first appear per the exercises_unlocks config.
  console.log(`\n=== Free_Exercise_List/Day16 (raw exercises array) ===`);
  const day16Snap = await db.collection("Free_Exercise_List").doc("Day16").get();
  if (!day16Snap.exists) {
    console.log("(missing)");
  } else {
    console.log(JSON.stringify(day16Snap.data(), null, 2));
  }

  process.exit(0);
})();
