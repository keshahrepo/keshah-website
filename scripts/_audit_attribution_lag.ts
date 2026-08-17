// Are the "last 7d" referral numbers being warped by the fact that the
// "where did you hear about us" question is asked LATE in the mobile-app
// post-auth flow? Hypothesis: recent signups haven't reached it yet, so
// they sit in "(no referral_source)" inflating that bucket. As users age,
// they migrate into named buckets — meaning the 7d view is biased toward
// the fastest/most-engaged users.
//
// To test: bucket signups from the last 14 days by AGE (how many days
// since they signed up) and look at the % that have a referral_source set
// at each age. If the answer-rate climbs sharply with age, that's the bias.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const now = Date.now();
  const since = new Date(now - 14 * 86_400_000);
  const snap = await db.collection("Users").where("created_at", ">=", since).get();

  // Bucket by age in days
  type AgeBucket = { total: number; tagged: number; jennifer: number; aadi: number; converted: number };
  const empty = (): AgeBucket => ({ total: 0, tagged: 0, jennifer: 0, aadi: 0, converted: 0 });
  const byAge: Record<number, AgeBucket> = {};

  let totalJenniferSeen = 0;
  let totalJenniferConv = 0;
  const jenniferByDay: Record<string, { signups: number; converted: number }> = {};

  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    const c = d.created_at?.toDate?.();
    if (!c) return;
    const ageDays = Math.floor((now - c.getTime()) / 86_400_000);
    if (!byAge[ageDays]) byAge[ageDays] = empty();
    const b = byAge[ageDays];
    b.total++;
    if (d.referral_source) b.tagged++;
    if (d.referral_source === "educator_jennifer") {
      b.jennifer++;
      totalJenniferSeen++;
      if (d.start_date) totalJenniferConv++;
      const dayKey = c.toISOString().slice(0, 10);
      if (!jenniferByDay[dayKey]) jenniferByDay[dayKey] = { signups: 0, converted: 0 };
      jenniferByDay[dayKey].signups++;
      if (d.start_date) jenniferByDay[dayKey].converted++;
    }
    if (d.referral_source === "founder_aadi") b.aadi++;
    if (d.start_date) b.converted++;
  });

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

  console.log(`\n=== % of users who answered the referral question, by signup age ===`);
  console.log(`  age (days)  total signups   tagged   answer%   converted   conv%`);
  for (let i = 0; i <= 14; i++) {
    const b = byAge[i];
    if (!b) continue;
    console.log(
      `  ${String(i).padStart(10)}   ${String(b.total).padStart(13)}   ${String(b.tagged).padStart(6)}   ${pct(b.tagged, b.total).padStart(7)}   ${String(b.converted).padStart(9)}   ${pct(b.converted, b.total).padStart(5)}`
    );
  }

  console.log(`\n=== Jennifer signups by calendar day (last 14d) ===`);
  console.log(`  date        signups  converted  conv%`);
  Object.entries(jenniferByDay)
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .forEach(([day, x]) => {
      console.log(`  ${day}   ${String(x.signups).padStart(7)}    ${String(x.converted).padStart(7)}   ${pct(x.converted, x.signups).padStart(6)}`);
    });
  console.log(`\nTotal Jennifer in last 14d: ${totalJenniferSeen} signups, ${totalJenniferConv} converted (${pct(totalJenniferConv, totalJenniferSeen)})`);

  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
