// Compare Aadi vs Jennifer on the same time window. Jennifer's first
// signup was 2026-05-03 (29 days ago). We compare:
// - signups, paid (start_date set), conv %
// - by week to see the trajectory
// - per-view efficiency given known view counts (Aadi ~4.8M, Jennifer 1.2M)

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const JENNIFER_FIRST = new Date("2026-05-03T00:00:00Z");
const NOW = new Date();

async function summarize(src: string) {
  const snap = await db
    .collection("Users")
    .where("referral_source", "==", src)
    .get();
  let signups = 0;
  let paid = 0;
  let male = 0, female = 0;
  // by week since Jennifer started
  const byWeek: Record<number, { signups: number; paid: number }> = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    const c = d.created_at?.toDate?.();
    if (!c || c < JENNIFER_FIRST) return;
    signups++;
    const conv = !!d.start_date;
    if (conv) paid++;
    if (d.selected_gender === "male") male++;
    else if (d.selected_gender === "female") female++;
    const week = Math.floor((c.getTime() - JENNIFER_FIRST.getTime()) / (7 * 86_400_000));
    if (!byWeek[week]) byWeek[week] = { signups: 0, paid: 0 };
    byWeek[week].signups++;
    if (conv) byWeek[week].paid++;
  });
  return { signups, paid, male, female, byWeek };
}

(async () => {
  const [a, j] = await Promise.all([summarize("founder_aadi"), summarize("educator_jennifer")]);

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);
  const days = Math.floor((NOW.getTime() - JENNIFER_FIRST.getTime()) / 86_400_000);

  console.log(`\n=== Aadi vs Jennifer — same window (last ${days} days, since ${JENNIFER_FIRST.toISOString().slice(0, 10)}) ===\n`);

  console.log(`                          Aadi          Jennifer`);
  console.log(`  Signups               ${String(a.signups).padStart(6)}        ${String(j.signups).padStart(6)}`);
  console.log(`  Paid                  ${String(a.paid).padStart(6)}        ${String(j.paid).padStart(6)}`);
  console.log(`  Conv rate             ${pct(a.paid, a.signups).padStart(6)}        ${pct(j.paid, j.signups).padStart(6)}`);
  console.log(`  Male / Female         ${String(a.male).padStart(3)}/${String(a.female).padEnd(3)}        ${String(j.male).padStart(3)}/${String(j.female).padEnd(3)}`);

  console.log(`\n=== By week since Jennifer started ===`);
  console.log(`  week        Aadi signups   Aadi paid    Jen signups   Jen paid`);
  for (let w = 0; w <= Math.floor(days / 7); w++) {
    const aw = a.byWeek[w] || { signups: 0, paid: 0 };
    const jw = j.byWeek[w] || { signups: 0, paid: 0 };
    console.log(
      `  Week ${w} (d${w * 7}-${w * 7 + 6})   ${String(aw.signups).padStart(12)}    ${String(aw.paid).padStart(8)}    ${String(jw.signups).padStart(11)}   ${String(jw.paid).padStart(8)}`
    );
  }

  // Per-view efficiency
  const aadiViews = 4_800_000;   // approximate
  const jenViews = 1_200_000;
  console.log(`\n=== Per-view efficiency (Aadi 4.8M assumed, Jen 1.2M) ===`);
  console.log(`  Views                 ${(aadiViews).toLocaleString().padStart(10)}    ${(jenViews).toLocaleString().padStart(9)}`);
  console.log(`  Views per signup      ${Math.round(aadiViews / a.signups).toLocaleString().padStart(10)}    ${Math.round(jenViews / j.signups).toLocaleString().padStart(9)}`);
  console.log(`  Views per paid sale   ${Math.round(aadiViews / a.paid).toLocaleString().padStart(10)}    ${Math.round(jenViews / j.paid).toLocaleString().padStart(9)}`);
  console.log(`  Signups per 100k views ${(a.signups / aadiViews * 100000).toFixed(1).padStart(9)}    ${(j.signups / jenViews * 100000).toFixed(1).padStart(8)}`);
  console.log(`  Paid per 100k views    ${(a.paid / aadiViews * 100000).toFixed(2).padStart(9)}    ${(j.paid / jenViews * 100000).toFixed(2).padStart(8)}`);

  // Ratios
  console.log(`\n=== Ratios ===`);
  console.log(`  Jen / Aadi views:        1 : ${(aadiViews / jenViews).toFixed(1)}    (expected ratio)`);
  console.log(`  Jen / Aadi signups:      1 : ${(a.signups / j.signups).toFixed(1)}`);
  console.log(`  Jen / Aadi paid:         1 : ${(a.paid / j.paid).toFixed(1)}`);

  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
