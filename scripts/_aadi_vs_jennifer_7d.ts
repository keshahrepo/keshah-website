import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const SINCE = new Date(Date.now() - 7 * 86_400_000);

async function summarize(src: string) {
  const snap = await db.collection("Users").where("referral_source", "==", src).get();
  let signups = 0, paid = 0, male = 0, female = 0;
  const byDay: Record<string, { signups: number; paid: number }> = {};
  snap.forEach((doc) => {
    const d = doc.data();
    if (d.is_deleted) return;
    const c = d.created_at?.toDate?.();
    if (!c || c < SINCE) return;
    signups++;
    if (d.start_date) paid++;
    if (d.selected_gender === "male") male++;
    else if (d.selected_gender === "female") female++;
    const day = c.toISOString().slice(0, 10);
    if (!byDay[day]) byDay[day] = { signups: 0, paid: 0 };
    byDay[day].signups++;
    if (d.start_date) byDay[day].paid++;
  });
  return { signups, paid, male, female, byDay };
}

(async () => {
  const [a, j] = await Promise.all([summarize("founder_aadi"), summarize("educator_jennifer")]);
  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

  console.log(`\n=== Aadi vs Jennifer — last 7 days (since ${SINCE.toISOString().slice(0, 10)}) ===\n`);
  console.log(`                          Aadi          Jennifer`);
  console.log(`  Signups               ${String(a.signups).padStart(6)}        ${String(j.signups).padStart(6)}`);
  console.log(`  Paid                  ${String(a.paid).padStart(6)}        ${String(j.paid).padStart(6)}`);
  console.log(`  Conv rate             ${pct(a.paid, a.signups).padStart(6)}        ${pct(j.paid, j.signups).padStart(6)}`);
  console.log(`  Male / Female         ${String(a.male).padStart(3)}/${String(a.female).padEnd(3)}        ${String(j.male).padStart(3)}/${String(j.female).padEnd(3)}`);

  console.log(`\n=== Day by day ===`);
  const allDays = new Set([...Object.keys(a.byDay), ...Object.keys(j.byDay)]);
  const sortedDays = Array.from(allDays).sort();
  console.log(`  date         Aadi signups  Aadi paid    Jen signups  Jen paid`);
  sortedDays.forEach((day) => {
    const ad = a.byDay[day] || { signups: 0, paid: 0 };
    const jd = j.byDay[day] || { signups: 0, paid: 0 };
    console.log(
      `  ${day}    ${String(ad.signups).padStart(11)}    ${String(ad.paid).padStart(7)}    ${String(jd.signups).padStart(10)}   ${String(jd.paid).padStart(7)}`
    );
  });

  console.log(`\n=== Ratios (last 7d) ===`);
  console.log(`  Signups ratio:  Jen 1 : ${j.signups > 0 ? (a.signups / j.signups).toFixed(1) : "∞"} Aadi`);
  console.log(`  Paid ratio:     Jen 1 : ${j.paid > 0 ? (a.paid / j.paid).toFixed(1) : "∞"} Aadi`);

  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
