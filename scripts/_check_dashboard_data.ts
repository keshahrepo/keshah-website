// Inspect the data layer that DashBoardBloc reads from. Both users seeing
// "no tasks for today / Refresh" suggests a global data-layer change.
//
// Checks:
//   1. Settings/app_general_settings — modified_at?
//   2. Settings/exercises_unlocks — modified_at?
//   3. Existence of Exercise_List + Free_Exercise_List + Womens_Free_Exercise_List
//      docs for the day numbers these two users would currently land on.
//   4. Sample doc to see structure
//
// Usage: npx tsx scripts/_check_dashboard_data.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

function fmtTs(ts: any): string {
  try { return ts?.toDate?.()?.toISOString() ?? "-"; } catch { return "-"; }
}

(async () => {
  // 1. Settings docs
  console.log(`▸ Settings/app_general_settings`);
  const ags = await db.collection("Settings").doc("app_general_settings").get();
  if (ags.exists) {
    const d = ags.data() as any;
    console.log(`  last modified: ${fmtTs(d.modified_at) || fmtTs(d.updated_at) || "-"}`);
    console.log(`  keys:          ${Object.keys(d).slice(0, 30).join(", ")}`);
  } else {
    console.log(`  ✗ MISSING`);
  }

  console.log(`\n▸ Settings/exercises_unlocks`);
  const eu = await db.collection("Settings").doc("exercises_unlocks").get();
  if (eu.exists) {
    const d = eu.data() as any;
    console.log(`  last modified: ${fmtTs(d.modified_at) || fmtTs(d.updated_at) || "-"}`);
    console.log(`  keys:          ${Object.keys(d).slice(0, 30).join(", ")}`);
  } else {
    console.log(`  ✗ MISSING`);
  }

  // 2. Sample Exercise_List docs — male VIP
  console.log(`\n▸ Exercise_List (male VIP — najinthant @ day ~154 / aftercare)`);
  const listMale = await db.collection("Exercise_List").limit(5).get();
  console.log(`  collection size sample: ${listMale.size}`);
  for (const d of listMale.docs) {
    console.log(`    doc ${d.id} keys=[${Object.keys(d.data()).slice(0, 8).join(",")}]`);
  }

  // 3. Sample Free_Exercise_List + Womens_Free_Exercise_List (female FreeV2)
  console.log(`\n▸ Womens_Free_Exercise_List (female FreeV2 — optionlimite @ day 1)`);
  const listFem = await db.collection("Womens_Free_Exercise_List").limit(5).get();
  console.log(`  collection size sample: ${listFem.size}`);
  for (const d of listFem.docs) {
    console.log(`    doc ${d.id} keys=[${Object.keys(d.data()).slice(0, 8).join(",")}]`);
  }

  // 4. Try fetching specifically day1 if exists (most common doc id pattern)
  console.log(`\n▸ Targeted lookups`);
  for (const [col, ids] of [
    ["Exercise_List", ["day154", "Day154", "154", "day_154"]],
    ["Womens_Free_Exercise_List", ["day1", "Day1", "1", "day_1"]],
    ["Free_Exercise_List", ["day1", "Day1", "1", "day_1"]],
  ] as const) {
    for (const id of ids) {
      const d = await db.collection(col).doc(id).get();
      if (d.exists) {
        console.log(`  ✓ ${col}/${id} exists — keys=[${Object.keys(d.data()!).slice(0, 8).join(",")}]`);
      }
    }
  }

  // 5. Check if Exercise_Models / Free_Exercise_Models / Womens_* exist at all
  for (const col of [
    "Exercise_Models",
    "Free_Exercise_Models",
    "Womens_Exercise_Models",
    "Womens_Free_Exercise_Models",
  ]) {
    const snap = await db.collection(col).limit(1).get();
    console.log(`  ${col}: ${snap.size} doc found (sample)`);
  }
})();
