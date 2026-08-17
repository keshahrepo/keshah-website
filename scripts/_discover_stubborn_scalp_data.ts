import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Discovery script for the stubborn-scalp intervention:
//  1. Find the neck_presses exercise ID in both men + women exercise
//     models collections (need the exact id to inject into variant docs).
//  2. Dump Day 7 through Day 16 docs from Free_Exercise_List and
//     Womens_Free_Exercise_List so we can see the current exercise
//     arrays and confirm neck_presses is added at Day 16.
(async () => {
  // 1. Find neck_presses ID in both exercise-model collections
  const modelCollections = [
    { name: "Free_Exercise_Models", label: "MEN" },
    { name: "Womens_Free_Exercise_Models", label: "WOMEN" },
  ];
  for (const { name, label } of modelCollections) {
    console.log(`\n=== ${label} · ${name} · neck-related exercises ===`);
    const snap = await db.collection(name).get();
    const neckRelated = snap.docs
      .map((d) => ({ id: d.id, data: d.data() }))
      .filter((row) => {
        const n = (row.data.name || row.data.title || "").toString().toLowerCase();
        return n.includes("neck");
      });
    if (neckRelated.length === 0) {
      console.log("  (no neck-related exercises found by name)");
    } else {
      for (const row of neckRelated) {
        console.log(`  doc id: ${row.id}`);
        console.log(`    name:  ${row.data.name || row.data.title}`);
        console.log(`    id:    ${row.data.id ?? "(no explicit id field)"}`);
      }
    }
  }

  // 2. Dump Day 7-16 docs from both day-list collections
  const listCollections = [
    { name: "Free_Exercise_List", label: "MEN" },
    { name: "Womens_Free_Exercise_List", label: "WOMEN" },
  ];
  for (const { name, label } of listCollections) {
    console.log(`\n=== ${label} · ${name} · Days 7-16 ===`);
    for (let day = 7; day <= 16; day++) {
      const docId = `Day${day}`;
      const snap = await db.collection(name).doc(docId).get();
      if (!snap.exists) {
        console.log(`  ${docId}: (missing)`);
        continue;
      }
      const data = snap.data()!;
      const exs = (data.exercises as any[]) || [];
      console.log(`  ${docId}: ${exs.length} exercises`);
      for (const ex of exs) {
        console.log(`     - ${ex.exerciseId ?? JSON.stringify(ex)}`);
      }
    }
  }
  process.exit(0);
})();
