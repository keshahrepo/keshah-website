import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("referral_source", "==", "educator_jennifer").get();

  let total = 0;
  let converted = 0;
  let male = 0, female = 0, unknown = 0;
  let firstAt: Date | null = null;
  let lastAt: Date | null = null;
  const byWindow = { d1: 0, d7: 0, d30: 0 };
  const now = Date.now();

  snap.forEach((d) => {
    const x = d.data();
    if (x.is_deleted) return;
    total++;
    if (x.start_date) converted++;
    const g = x.selected_gender;
    if (g === "male") male++;
    else if (g === "female") female++;
    else unknown++;

    const created = x.created_at?.toDate?.();
    if (created) {
      if (!firstAt || created < firstAt) firstAt = created;
      if (!lastAt || created > lastAt) lastAt = created;
      const ageDays = (now - created.getTime()) / 86_400_000;
      if (ageDays <= 1) byWindow.d1++;
      if (ageDays <= 7) byWindow.d7++;
      if (ageDays <= 30) byWindow.d30++;
    }
  });

  const pct = (n: number, d: number) => (d === 0 ? "—" : `${((n / d) * 100).toFixed(1)}%`);

  console.log(`\n=== Jennifer (referral_source = "educator_jennifer") ===\n`);
  console.log(`Total signups (all-time): ${total}`);
  console.log(`Converted (start_date set): ${converted}  (${pct(converted, total)})`);
  console.log(`\nFirst signup: ${firstAt ? (firstAt as Date).toISOString() : "—"}`);
  console.log(`Most recent: ${lastAt ? (lastAt as Date).toISOString() : "—"}`);
  console.log(`\nBy gender:`);
  console.log(`  male:    ${male}  (${pct(male, total)})`);
  console.log(`  female:  ${female}  (${pct(female, total)})`);
  console.log(`  unknown: ${unknown}  (${pct(unknown, total)})`);
  console.log(`\nRecent volume:`);
  console.log(`  last 24h:  ${byWindow.d1}`);
  console.log(`  last 7d:   ${byWindow.d7}`);
  console.log(`  last 30d:  ${byWindow.d30}`);

  process.exit(0);
})().catch((e) => { console.error("ERR:", e.message); process.exit(1); });
