// Sanity check on paid_at distribution
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const now = Date.now();

  // Just count all paid users
  const allPaid = await db.collection("Users").where("paid_at", "!=", null).get();
  console.log(`Total users with paid_at != null: ${allPaid.docs.length}`);

  // Distribute by age in days
  const ages: number[] = [];
  let nullCount = 0;
  let stringCount = 0;
  let tsCount = 0;
  for (const d of allPaid.docs) {
    const v = d.data().paid_at;
    if (!v) { nullCount++; continue; }
    if (typeof v === "string") {
      stringCount++;
      const ms = new Date(v).getTime();
      if (!isNaN(ms)) ages.push(Math.floor((now - ms) / 86400000));
    } else if (v instanceof Timestamp || (v && typeof v.toDate === "function")) {
      tsCount++;
      const ms = v.toDate().getTime();
      ages.push(Math.floor((now - ms) / 86400000));
    } else {
      console.log(`  Unknown type:`, typeof v, JSON.stringify(v).slice(0, 80));
    }
  }
  console.log(`Types: Timestamp=${tsCount}, string=${stringCount}, null=${nullCount}`);
  ages.sort((a, b) => a - b);
  if (ages.length === 0) {
    console.log("No usable ages");
    process.exit(0);
  }
  console.log(`paid_at age distribution (days ago):`);
  console.log(`  min=${ages[0]}, max=${ages[ages.length - 1]}`);
  console.log(`  p10=${ages[Math.floor(ages.length * 0.1)]}, p25=${ages[Math.floor(ages.length * 0.25)]}, p50=${ages[Math.floor(ages.length * 0.5)]}, p75=${ages[Math.floor(ages.length * 0.75)]}, p90=${ages[Math.floor(ages.length * 0.9)]}`);

  // Buckets
  const buckets: Record<string, number> = {};
  for (const a of ages) {
    const k = a < 7 ? "<7d" : a < 14 ? "7-13d" : a < 30 ? "14-29d" : a < 60 ? "30-59d" : a < 90 ? "60-89d" : a < 180 ? "90-179d" : "180+d";
    buckets[k] = (buckets[k] || 0) + 1;
  }
  console.log(`\nBuckets:`);
  for (const [k, v] of Object.entries(buckets)) {
    console.log(`  ${k.padEnd(10)} ${v}`);
  }

  // Test the range query directly
  const cutoff30 = new Date(now - 30 * 86400000);
  const range30 = await db
    .collection("Users")
    .where("paid_at", "<=", Timestamp.fromDate(cutoff30))
    .get();
  console.log(`\nQuery: paid_at <= ${cutoff30.toISOString()} → ${range30.docs.length} docs`);

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
