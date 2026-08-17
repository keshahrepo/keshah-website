import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

type Bucket = {
  signups: number;
  converted: number;
  male: number;
  female: number;
  unknown: number;
  d1: number;
  d7: number;
  d30: number;
  firstAt: Date | null;
  lastAt: Date | null;
};
function emptyBucket(): Bucket {
  return { signups: 0, converted: 0, male: 0, female: 0, unknown: 0, d1: 0, d7: 0, d30: 0, firstAt: null, lastAt: null };
}

(async () => {
  const snap = await db.collection("Users").get();
  const now = Date.now();
  const buckets: Record<string, Bucket> = {};
  buckets["(no referral_source)"] = emptyBucket();

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    const src = d.referral_source ? String(d.referral_source) : "(no referral_source)";
    if (!buckets[src]) buckets[src] = emptyBucket();
    const b = buckets[src];
    b.signups++;
    if (d.start_date) b.converted++;
    const g = d.selected_gender;
    if (g === "male") b.male++;
    else if (g === "female") b.female++;
    else b.unknown++;
    const created = d.created_at?.toDate?.();
    if (created) {
      if (!b.firstAt || created < b.firstAt) b.firstAt = created;
      if (!b.lastAt || created > b.lastAt) b.lastAt = created;
      const ageDays = (now - created.getTime()) / 86_400_000;
      if (ageDays <= 1) b.d1++;
      if (ageDays <= 7) b.d7++;
      if (ageDays <= 30) b.d30++;
    }
  });

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
  const ageDays = (d: Date | null) => (d ? Math.round((now - d.getTime()) / 86_400_000) : null);

  const rows = Object.entries(buckets)
    .map(([src, b]) => ({ src, b }))
    .sort((a, b) => b.b.signups - a.b.signups);

  // Total context
  let totalSignups = 0, totalConverted = 0;
  rows.forEach(({ b }) => { totalSignups += b.signups; totalConverted += b.converted; });
  console.log(`\nTotal users (all-time, undeleted): ${totalSignups}`);
  console.log(`Total converted: ${totalConverted} (${pct(totalConverted, totalSignups)})\n`);

  console.log(`=== All-time: by referral_source ===`);
  console.log(`  ${"source".padEnd(26)} ${"signups".padStart(8)} ${"conv".padStart(6)} ${"rate".padStart(7)} ${"% of all".padStart(9)} ${"24h".padStart(5)} ${"7d".padStart(5)} ${"30d".padStart(5)} ${"first ago".padStart(10)} ${"last ago".padStart(9)}`);
  rows.forEach(({ src, b }) => {
    const firstAgo = ageDays(b.firstAt);
    const lastAgo = ageDays(b.lastAt);
    console.log(
      `  ${src.padEnd(26)} ${String(b.signups).padStart(8)} ${String(b.converted).padStart(6)} ${pct(b.converted, b.signups).padStart(7)} ${pct(b.signups, totalSignups).padStart(9)} ${String(b.d1).padStart(5)} ${String(b.d7).padStart(5)} ${String(b.d30).padStart(5)} ${(firstAgo === null ? "—" : firstAgo + "d").padStart(10)} ${(lastAgo === null ? "—" : lastAgo + "d").padStart(9)}`
    );
  });

  console.log(`\n=== Gender mix per source ===`);
  console.log(`  ${"source".padEnd(26)} ${"male%".padStart(8)} ${"female%".padStart(8)} ${"unk%".padStart(8)}   ${"m conv%".padStart(8)} ${"f conv%".padStart(8)}`);
  // Need male/female conversion separately — re-read by source
  // Quick second pass for gender conversion rates
  const genderConv: Record<string, { mSign: number; mConv: number; fSign: number; fConv: number }> = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    const src = d.referral_source ? String(d.referral_source) : "(no referral_source)";
    if (!genderConv[src]) genderConv[src] = { mSign: 0, mConv: 0, fSign: 0, fConv: 0 };
    const g = d.selected_gender;
    const conv = !!d.start_date;
    if (g === "male") { genderConv[src].mSign++; if (conv) genderConv[src].mConv++; }
    else if (g === "female") { genderConv[src].fSign++; if (conv) genderConv[src].fConv++; }
  });

  rows.forEach(({ src, b }) => {
    const gc = genderConv[src] || { mSign: 0, mConv: 0, fSign: 0, fConv: 0 };
    console.log(
      `  ${src.padEnd(26)} ${pct(b.male, b.signups).padStart(8)} ${pct(b.female, b.signups).padStart(8)} ${pct(b.unknown, b.signups).padStart(8)}   ${pct(gc.mConv, gc.mSign).padStart(8)} ${pct(gc.fConv, gc.fSign).padStart(8)}`
    );
  });

  console.log(`\nLegend: 'first ago' = days since first signup with this source; 'last ago' = days since most recent.\n`);
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
