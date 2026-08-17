import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Wider audit — pull ALL exercise models and ALL day docs across many
// days. Prints every exercise ID + name so we can see if anything was
// missed (e.g., a `scalp_stretches_03` doc I never verified exists).
(async () => {
  const modelCollections = [
    "Free_Exercise_Models",
    "Womens_Free_Exercise_Models",
  ];
  for (const name of modelCollections) {
    console.log(`\n=== FULL ${name} DUMP ===`);
    const snap = await db.collection(name).get();
    for (const d of snap.docs.sort((a, b) => a.id.localeCompare(b.id))) {
      const data = d.data();
      console.log(`  ${d.id.padEnd(30)} · name: "${data.name || data.title || "(none)"}"`);
    }
  }

  const listCollections = [
    "Free_Exercise_List",
    "Womens_Free_Exercise_List",
  ];
  for (const name of listCollections) {
    console.log(`\n=== ${name} · Day 1-30 exerciseIds ===`);
    const firstAppearance: Record<string, number> = {};
    for (let day = 1; day <= 30; day++) {
      const snap = await db.collection(name).doc(`Day${day}`).get();
      if (!snap.exists) {
        console.log(`  Day${day}: (missing)`);
        continue;
      }
      const exs = (snap.data()!.exercises as any[]) || [];
      const ids = exs.map((e) => e.exerciseId);
      console.log(`  Day${day.toString().padEnd(2)}: ${ids.join(", ")}`);
      for (const id of ids) {
        if (id && !(id in firstAppearance)) firstAppearance[id] = day;
      }
    }
    console.log(`\n  First appearance summary:`);
    for (const [id, day] of Object.entries(firstAppearance).sort((a, b) => a[1] - b[1])) {
      console.log(`    Day ${day.toString().padEnd(2)} · ${id}`);
    }
  }
  process.exit(0);
})();
