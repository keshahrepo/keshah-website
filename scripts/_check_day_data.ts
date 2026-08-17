// Dig into the specific day docs each user lands on. Both reported "no
// tasks for today" — need to see if doc has exercises but they can't
// resolve, or if exercises array is empty, or which day they actually
// land on given their stage.
//
// Usage: npx tsx scripts/_check_day_data.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function inspectDay(col: string, day: number) {
  const docId = `Day${day}`;
  const d = await db.collection(col).doc(docId).get();
  if (!d.exists) {
    console.log(`  ${col}/${docId}: NOT FOUND`);
    return;
  }
  const x = d.data() as any;
  const ex = x.exercises || [];
  console.log(`  ${col}/${docId}: ${ex.length} exercises, totalMinutes=${x.totalMinutes}`);
  for (const e of ex.slice(0, 4)) {
    console.log(`    • ${JSON.stringify(e)}`);
  }
  return ex;
}

(async () => {
  // optionlimite — FreeV2 female, no start_date.
  // FreeV2 day calc with no free_stoppage_switched_at_date is the suspicious case.
  // Likely lands on Day1 or fails entirely.
  console.log(`▸ optionlimite (FreeV2 female, Day ~1)`);
  await inspectDay("Womens_Free_Exercise_List", 1);
  await inspectDay("Womens_Free_Exercise_List", 2);

  // najinthant — VIP male, signed up Apr 13 2025. Days since = ~425. Capped at 120.
  console.log(`\n▸ najinthant (VIP male, capped at Day 120)`);
  await inspectDay("Exercise_List", 120);
  await inspectDay("Exercise_List", 119);
  await inspectDay("Exercise_List", 121);  // does aftercare overflow into Exercise_List?

  // What's the highest Day# in each collection?
  console.log(`\n▸ Day range scan`);
  for (const col of ["Exercise_List", "Womens_Free_Exercise_List", "Free_Exercise_List", "Womens_Exercise_List"]) {
    const docs = await db.collection(col).listDocuments();
    const nums = docs.map(d => {
      const m = d.id.match(/^Day(\d+)$/i);
      return m ? parseInt(m[1], 10) : NaN;
    }).filter(n => !isNaN(n)).sort((a, b) => a - b);
    if (nums.length) {
      console.log(`  ${col}: ${docs.length} total docs, Day range ${nums[0]}…${nums[nums.length-1]} (${nums.length} are Day#)`);
    } else {
      console.log(`  ${col}: ${docs.length} total docs (none match Day# pattern)`);
    }
  }

  // Check what exercise IDs the Day1 women doc references actually resolve to
  console.log(`\n▸ Resolve Womens_Free_Exercise_List/Day1 → Womens_Free_Exercise_Models`);
  const day1 = await db.collection("Womens_Free_Exercise_List").doc("Day1").get();
  if (day1.exists) {
    const ex = (day1.data() as any).exercises || [];
    for (const e of ex) {
      // Try common id field names
      const id = e.id || e.exercise_id || e.exerciseId || (typeof e === "string" ? e : null);
      if (id) {
        const m = await db.collection("Womens_Free_Exercise_Models").doc(id).get();
        console.log(`    ${id}: ${m.exists ? "✓ resolves" : "✗ MISSING"}`);
      } else {
        console.log(`    (no id field on entry: ${JSON.stringify(e).slice(0, 100)})`);
      }
    }
  }
})();
