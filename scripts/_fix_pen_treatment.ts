// Fix: pen_treatment_06 is missing from Free_Exercise_Models. Legacy
// user_type:"free" users in REGROWTH stage hit this on every pin day
// (3, 10, 17, 24, 31, 38, ...) and get blank task lists.
//
// Copy pen_treatment_06 from Exercise_Models -> Free_Exercise_Models.
// Doesn't touch women's collections (per CLAUDE.md, women don't get pin
// treatment).
//
// Idempotent: skips if already present at target.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const ID = "pen_treatment_06";
const SRC = "Exercise_Models";
const TARGETS = ["Free_Exercise_Models"];

(async () => {
  console.log(`▸ Reading source: ${SRC}/${ID}`);
  const srcDoc = await db.collection(SRC).doc(ID).get();
  if (!srcDoc.exists) {
    console.log(`  ✗ source missing`);
    process.exit(1);
  }
  const data = srcDoc.data();
  console.log(`  ✓ source has ${Object.keys(data!).length} fields: ${Object.keys(data!).slice(0,10).join(", ")}…`);

  for (const target of TARGETS) {
    const tgtRef = db.collection(target).doc(ID);
    const tgtDoc = await tgtRef.get();
    if (tgtDoc.exists) {
      console.log(`\n  ${target}/${ID}: already exists — skipping (idempotent)`);
      continue;
    }
    console.log(`\n▸ Writing ${target}/${ID}`);
    await tgtRef.set(data!);
    console.log(`  ✓ done`);
  }

  console.log(`\n▸ Verification`);
  for (const target of TARGETS) {
    const d = await db.collection(target).doc(ID).get();
    console.log(`  ${target}/${ID}: ${d.exists ? "✓ present" : "✗ MISSING"}`);
  }

  console.log(`\nNext app launch for any legacy user_type:"free" + treatment_stage:REGROWTH user`);
  console.log(`on a pin day (3/10/17/24/31/...) should now populate the pen treatment session.`);
})();
