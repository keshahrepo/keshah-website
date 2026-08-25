import { getFirebaseAdmin } from "../lib/firebase-admin";
async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Users").select("userLocalTimeZone").limit(2000).get();
  const counts: Record<string, number> = {};
  for (const doc of snap.docs) {
    const tz = doc.data().userLocalTimeZone;
    const key = tz === undefined || tz === null ? "(missing)" : String(tz);
    counts[key] = (counts[key] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 30);
  console.log(`Top 30 distinct userLocalTimeZone values (sample of 2000):\n`);
  for (const [tz, n] of sorted) console.log(`  ${n.toString().padStart(5)}  ${tz}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
