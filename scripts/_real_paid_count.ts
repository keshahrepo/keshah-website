import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const TEST_EMAIL = /^test\d+@test\.com$/i;
(async () => {
  const from = Timestamp.fromDate(new Date("2026-08-18T00:00:00Z"));
  const to = Timestamp.fromDate(new Date(Date.now() - 10 * 86_400_000));
  const snap = await db.collection("Users").where("created_at", ">=", from).where("created_at", "<=", to).get();
  const counts: Record<string, number> = {};
  let total = 0, proTrue = 0, hasConvertedAt = 0, active = 0;
  for (const d of snap.docs) {
    const u:any = d.data();
    if (u.is_deleted) continue;
    if (typeof u.email === "string" && TEST_EMAIL.test(u.email)) continue;
    total++;
    if (u.pro === true) proTrue++;
    if (u.converted_at != null) hasConvertedAt++;
    const s = u.subscription_status ?? "(unset)";
    counts[s] = (counts[s] ?? 0) + 1;
    if (s === "active") active++;
  }
  console.log(`Cohort: ${total}`);
  console.log(`pro === true:               ${proTrue}   (${(proTrue/total*100).toFixed(2)}%)`);
  console.log(`converted_at set:           ${hasConvertedAt}   (${(hasConvertedAt/total*100).toFixed(2)}%)`);
  console.log(`subscription_status=active: ${active}   (${(active/total*100).toFixed(2)}%)`);
  console.log(`\nAll subscription_status values seen:`);
  for (const [k,v] of Object.entries(counts).sort((a,b) => b[1]-a[1])) console.log(`  ${k.padEnd(20)}  ${v}`);
})();
