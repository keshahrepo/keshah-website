import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// FreeV2 users pull their routine from FREEV2_*_STOPPAGE_EXERCISES
// collections, not from Free_Exercise_List. Audit the correct source.
(async () => {
  const collections = [
    { list: "FREEV2_MEN_STOPPAGE_EXERCISES", model: "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", label: "MEN STOPPAGE" },
    { list: "FREEV2_WOMEN_STOPPAGE_EXERCISES", model: "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL", label: "WOMEN STOPPAGE" },
  ];

  for (const { list, model, label } of collections) {
    console.log(`\n=== ${label} ===`);

    // Model dump
    console.log(`\n${model}:`);
    const modelSnap = await db.collection(model).get();
    if (modelSnap.empty) {
      console.log("  (empty or missing)");
    } else {
      for (const d of modelSnap.docs.sort((a, b) => a.id.localeCompare(b.id))) {
        const data = d.data();
        console.log(`  ${d.id.padEnd(30)} · name: "${data.name || data.title || "(none)"}"`);
      }
    }

    // Day 1-30 dump
    console.log(`\n${list} Day 1-30:`);
    const firstAppearance: Record<string, number> = {};
    for (let day = 1; day <= 30; day++) {
      const snap = await db.collection(list).doc(`Day${day}`).get();
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
