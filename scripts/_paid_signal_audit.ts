// Audit: how many "paid" users in the +162 cohort come from each
// signal? Splits converted_at (RC webhook) from pro=true fallback,
// and flags overlap. Also breaks out comped (open_account, extra
// tags) from real payers.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const TEST_EMAIL = /^test\d+@test\.com$/i;
const COHORT_FROM = new Date("2026-08-18T00:00:00Z");
const COHORT_TO = new Date(Date.now() - 10 * 86_400_000);

(async () => {
  const snap = await db.collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(COHORT_FROM))
    .where("created_at", "<=", Timestamp.fromDate(COHORT_TO))
    .get();

  let n = 0;
  let convertedAtOnly = 0, proOnly = 0, both = 0;
  let comped = 0;
  let convertedAndNotComped = 0;
  const sample: any[] = [];

  for (const d of snap.docs) {
    const u:any = d.data();
    if (u.is_deleted) continue;
    if (typeof u.email === "string" && TEST_EMAIL.test(u.email)) continue;
    n++;
    const hasConvertedAt = u.converted_at != null;
    const isPro = u.pro === true;
    const isComped = u.open_account === true;

    if (hasConvertedAt && isPro) both++;
    else if (hasConvertedAt) convertedAtOnly++;
    else if (isPro) proOnly++;

    if (isPro && isComped) comped++;
    if (hasConvertedAt && !isComped) convertedAndNotComped++;

    if ((hasConvertedAt || isPro) && sample.length < 12) {
      sample.push({
        uid: d.id,
        email: u.email,
        converted_at: hasConvertedAt,
        pro: isPro,
        open_account: isComped,
        started_trial: u.started_trial === true,
        subscription_status: u.subscription_status,
        extra_user_tags: u.extra_user_tags,
      });
    }
  }

  console.log(`Cohort: ${n} users`);
  console.log(`\nPaid-signal breakdown:`);
  console.log(`  converted_at + pro=true: ${both}`);
  console.log(`  converted_at only:       ${convertedAtOnly}`);
  console.log(`  pro=true only:           ${proOnly}   ← suspicious`);
  console.log(`\nComped (open_account=true & pro=true): ${comped}`);
  console.log(`Real payers (converted_at & not comped): ${convertedAndNotComped}`);
  console.log(`\n=== Sample paid users ===`);
  for (const s of sample) console.log(JSON.stringify(s));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
