import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

type B = {
  signups: number; converted: number;
  male: number; female: number; unknown: number;
  mSign: number; mConv: number; fSign: number; fConv: number;
};
const empty = (): B => ({ signups: 0, converted: 0, male: 0, female: 0, unknown: 0, mSign: 0, mConv: 0, fSign: 0, fConv: 0 });

(async () => {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const snap = await db.collection("Users").where("created_at", ">=", since).get();

  const buckets: Record<string, B> = {};
  buckets["(no referral_source)"] = empty();
  let total = 0, totalConv = 0;

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    total++;
    const conv = !!d.start_date;
    if (conv) totalConv++;
    const src = d.referral_source ? String(d.referral_source) : "(no referral_source)";
    if (!buckets[src]) buckets[src] = empty();
    const b = buckets[src];
    b.signups++;
    if (conv) b.converted++;
    const g = d.selected_gender;
    if (g === "male") { b.male++; b.mSign++; if (conv) b.mConv++; }
    else if (g === "female") { b.female++; b.fSign++; if (conv) b.fConv++; }
    else b.unknown++;
  });

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

  console.log(`\n=== Last 7 days (since ${since.toISOString()}) ===`);
  console.log(`Total signups: ${total}`);
  console.log(`Total converted: ${totalConv}  (${pct(totalConv, total)})\n`);

  const rows = Object.entries(buckets)
    .map(([src, b]) => ({ src, b }))
    .sort((a, b) => b.b.signups - a.b.signups);

  console.log(`  ${"source".padEnd(26)} ${"signups".padStart(8)} ${"conv".padStart(5)} ${"rate".padStart(7)} ${"% all".padStart(7)} ${"male%".padStart(7)} ${"m conv".padStart(7)} ${"f conv".padStart(7)}`);
  rows.forEach(({ src, b }) => {
    console.log(
      `  ${src.padEnd(26)} ${String(b.signups).padStart(8)} ${String(b.converted).padStart(5)} ${pct(b.converted, b.signups).padStart(7)} ${pct(b.signups, total).padStart(7)} ${pct(b.male, b.signups).padStart(7)} ${pct(b.mConv, b.mSign).padStart(7)} ${pct(b.fConv, b.fSign).padStart(7)}`
    );
  });
  console.log();
  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
