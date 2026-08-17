// Compare male vs female conversion rate for the last 7 days.
//
// Cohort: users with created_at in the last 7 days.
// Groups: selected_gender = male / female / other.
// Conversion signal: extra_user_tags contains "paidStoppage" OR
// regrowth_treatment_purchased == true. This is the standard "paid" flag
// used by other analytics scripts in this repo (matches the memory note
// that `converted_at` is the canonical trial-purchase signal for FreeV2).
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_gender_conversion_7d.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

interface Row { total: number; paid: number; }
const empty = (): Row => ({ total: 0, paid: 0 });

(async () => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  console.log(
    `Window: ${sevenDaysAgo.toISOString()} → ${now.toISOString()}\n`
  );

  const snap = await db
    .collection("Users")
    .where("created_at", ">=", sevenDaysAgo)
    .get();

  console.log(`Users created in window: ${snap.size}\n`);

  const buckets: Record<string, Row> = {
    male: empty(),
    female: empty(),
    other: empty(),
    unknown: empty(),
  };

  for (const doc of snap.docs) {
    const x = doc.data() as Record<string, unknown>;
    if (x.is_deleted) continue;

    const gender = typeof x.selected_gender === "string" ? x.selected_gender.toLowerCase() : "";
    const key = gender === "male" ? "male" : gender === "female" ? "female" : gender ? "other" : "unknown";

    // FreeV2 canonical trial-purchase signal is `converted_at` (per repo
    // memory). This is set when a user converts from free-trial state
    // to an active paid subscription. `paid_at` and store subscription
    // IDs are also checked as backup for edge cases.
    const hasConvertedAt = !!x.converted_at;
    const hasPaidAt = !!x.paid_at;
    const hasSubscription =
      !!x.stripe_customer_id ||
      !!x.razorpay_subscription_id ||
      !!x.razorpay_customer_id;
    const boughtKit = x.regrowth_treatment_purchased === true;
    const paid = hasConvertedAt || hasPaidAt || hasSubscription || boughtKit;

    buckets[key].total++;
    if (paid) buckets[key].paid++;
  }

  const totalUsers = Object.values(buckets).reduce((s, r) => s + r.total, 0);
  const totalPaid = Object.values(buckets).reduce((s, r) => s + r.paid, 0);

  const pct = (paid: number, total: number) =>
    total ? ((paid / total) * 100).toFixed(1) + "%" : "—";

  console.log("Gender      Total    Paid    Conversion");
  console.log("─".repeat(46));
  for (const key of ["male", "female", "other", "unknown"] as const) {
    const r = buckets[key];
    console.log(
      `${key.padEnd(11)} ${String(r.total).padStart(5)}   ${String(r.paid).padStart(5)}   ${pct(r.paid, r.total).padStart(8)}`
    );
  }
  console.log("─".repeat(46));
  console.log(
    `${"TOTAL".padEnd(11)} ${String(totalUsers).padStart(5)}   ${String(totalPaid).padStart(5)}   ${pct(totalPaid, totalUsers).padStart(8)}`
  );

  // Male vs female head-to-head (ignoring other/unknown)
  const m = buckets.male;
  const f = buckets.female;
  console.log(`\nMale vs Female:`);
  const mRate = m.total ? (m.paid / m.total) : 0;
  const fRate = f.total ? (f.paid / f.total) : 0;
  console.log(`  Male:   ${m.paid}/${m.total} = ${pct(m.paid, m.total)}`);
  console.log(`  Female: ${f.paid}/${f.total} = ${pct(f.paid, f.total)}`);
  if (m.total && f.total) {
    const diff = ((mRate - fRate) * 100).toFixed(1);
    const better = mRate > fRate ? "Male" : "Female";
    console.log(`  ${better} converts ${Math.abs(Number(diff))}pp higher.`);
  }

  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
