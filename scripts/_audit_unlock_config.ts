import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Cross-check the exercises_unlocks_free_stoppage config against the
// actual routine content in Day 1-20 docs. Any exercise whose FIRST
// APPEARANCE in the routine doesn't match its config `days` field is
// an inconsistency the UI countdown is lying about.
(async () => {
  // Config: what the UI says
  const configSnap = await db
    .collection("Settings")
    .doc("exercises_unlocks_free_stoppage")
    .get();
  const config = configSnap.data() || {};

  // Walk Day 1-20 for both men + women collections and record first
  // appearance of each exercise ID
  const collections = [
    { name: "Free_Exercise_List", label: "MEN", configKey: "men" },
    { name: "Womens_Free_Exercise_List", label: "WOMEN", configKey: "women" },
  ];

  for (const { name, label, configKey } of collections) {
    console.log(`\n=== ${label} · ${name} ===`);
    const firstAppearance: Record<string, number> = {};
    for (let day = 1; day <= 20; day++) {
      const daySnap = await db.collection(name).doc(`Day${day}`).get();
      if (!daySnap.exists) continue;
      const exs = (daySnap.data()!.exercises as any[]) || [];
      for (const ex of exs) {
        const id = ex.exerciseId;
        if (id && !(id in firstAppearance)) {
          firstAppearance[id] = day;
        }
      }
    }

    // Map exercise names to IDs by scanning the models collection
    const modelName = name.replace("List", "Models");
    const modelSnap = await db.collection(modelName).get();
    const idToName: Record<string, string> = {};
    for (const d of modelSnap.docs) {
      const data = d.data();
      const id = data.id ?? d.id;
      const displayName = data.name || data.title || "(no name)";
      idToName[id] = displayName;
    }

    console.log("Actual first-appearance in Day 1-20 routine:");
    for (const id of Object.keys(firstAppearance).sort()) {
      console.log(`  Day ${firstAppearance[id].toString().padEnd(2)} · ${id.padEnd(25)} · ${idToName[id] ?? "(unknown)"}`);
    }

    console.log("\nConfig says (exercises_unlocks_free_stoppage):");
    const configArr = (config[configKey] as any[]) || [];
    for (const entry of configArr) {
      const unlockDay = (entry.days ?? 0) + 1;
      console.log(
        `  Day ${unlockDay.toString().padEnd(2)} · ${(entry.title as string).padEnd(25)} · ${entry.advanced ? "[ADVANCED]" : ""}`
      );
    }

    console.log("\nInconsistencies (config vs actual):");
    let anyBad = false;
    for (const entry of configArr) {
      const configDay = (entry.days ?? 0) + 1;
      // Find matching model by title
      const matchedId = Object.entries(idToName).find(
        ([, n]) => n === entry.title
      )?.[0];
      if (!matchedId) {
        console.log(`  ⚠️  ${entry.title}: no matching exercise model found`);
        anyBad = true;
        continue;
      }
      const actualDay = firstAppearance[matchedId];
      if (actualDay === undefined) {
        console.log(
          `  ⚠️  ${entry.title} (${matchedId}): config says Day ${configDay}, but not present in Day 1-20 routine`
        );
        anyBad = true;
      } else if (actualDay !== configDay) {
        console.log(
          `  ❌ ${entry.title} (${matchedId}): config Day ${configDay}, ACTUAL Day ${actualDay}`
        );
        anyBad = true;
      }
    }
    if (!anyBad) console.log("  ✓ All consistent");
  }

  process.exit(0);
})();
