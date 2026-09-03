import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  // How long is Day 1 vs Day 20 in Exercise_List?
  for (const dayId of ["Day1", "Day10", "Day20"]) {
    const s = await db.collection("Exercise_List").doc(dayId).get();
    const d = s.data();
    console.log(`${dayId}: ${d?.exercises?.length || 0} exercises`);
    if (d?.exercises && d.exercises[0]) {
      console.log(`  first exercise sample: ${JSON.stringify(d.exercises[0])}`);
    }
  }
  // Compare with FreeV2 stoppage
  const fv2 = await db.collection("FREEV2_MENS_STOPPAGE_EXERCISES").get();
  console.log(`\nFREEV2_MENS_STOPPAGE_EXERCISES has ${fv2.size} day docs`);
  for (const dayId of ["Day1", "Day10", "Day30"]) {
    const s = await db.collection("FREEV2_MENS_STOPPAGE_EXERCISES").doc(dayId).get();
    const d = s.data();
    if (d) console.log(`  ${dayId}: ${d?.exercises?.length || 0} exercises`);
  }
  // Free_Exercise_List (FreeV1)
  const fv1 = await db.collection("Free_Exercise_List").get();
  console.log(`\nFree_Exercise_List has ${fv1.size} day docs`);
}
main().catch(e => { console.error(e); process.exit(1); });
