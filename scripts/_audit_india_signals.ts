// Audit India-signal coverage across the anniversary-blast eligible cohort.
// Which fields actually catch Indian users when tz is missing?

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

function countCompletedDays(progress: unknown): number {
  if (!progress || typeof progress !== "object") return 0;
  let count = 0;
  for (const key of Object.keys(progress as Record<string, unknown>)) {
    if (!/^day\d+$/i.test(key)) continue;
    const entries = (progress as Record<string, unknown>)[key];
    if (!Array.isArray(entries)) continue;
    if (entries.some((e) => e && typeof e === "object" && (e as any).is_completed === true)) count++;
  }
  return count;
}

(async () => {
  const snap = await db.collection("Users").get();
  const stats = {
    total: 0,
    eligibleBaseline: 0,
    tzAsiaKolkata: 0,
    phoneP91: 0,
    razorpayId: 0,
    referralIndia: 0,
    tzAny: 0,
    phoneAny: 0,
    unionIndia: 0,
    unionIndia_atLeastOneNonTz: 0,
  };
  const referralSourceCounts: Record<string, number> = {};

  for (const d of snap.docs) {
    const x: any = d.data();
    stats.total++;
    if (x.is_deleted) continue;
    const email = (x.email || "").toLowerCase();
    if (!email) continue;
    if (x.regrowth_treatment_purchased === true) continue;
    if (countCompletedDays(x.progress) < 1) continue;
    stats.eligibleBaseline++;

    const tz = x.user_local_time_zone || "";
    const phoneCC = x.phone_number?.country_code || "";
    const phoneNum = x.phone_number?.complete_number || "";
    const razorpayId = x.razorpay_customer_id || x.razorpay_subscription_id || "";
    const referral = String(x.referral_source || "").toLowerCase();

    if (tz) stats.tzAny++;
    if (phoneCC || phoneNum) stats.phoneAny++;

    const isTzIndia = tz === "Asia/Kolkata";
    const isPhoneIndia = phoneCC === "+91" || phoneNum.startsWith("+91");
    const isRazorpay = !!razorpayId;
    const isReferralIndia = referral.includes("india") || referral.includes("ind_");

    if (isTzIndia) stats.tzAsiaKolkata++;
    if (isPhoneIndia) stats.phoneP91++;
    if (isRazorpay) stats.razorpayId++;
    if (isReferralIndia) stats.referralIndia++;

    const anyIndia = isTzIndia || isPhoneIndia || isRazorpay || isReferralIndia;
    if (anyIndia) stats.unionIndia++;
    if (anyIndia && !isTzIndia) stats.unionIndia_atLeastOneNonTz++;

    if (referral) referralSourceCounts[referral] = (referralSourceCounts[referral] || 0) + 1;
  }

  console.log(`\n=== India signal audit (≥1 completed day, non-purchaser cohort) ===\n`);
  console.log(`Total user docs:                 ${stats.total}`);
  console.log(`Baseline eligible cohort:        ${stats.eligibleBaseline}`);
  console.log(``);
  console.log(`Field coverage across cohort:`);
  console.log(`  tz set (any value):            ${stats.tzAny}  (${((stats.tzAny/stats.eligibleBaseline)*100).toFixed(1)}%)`);
  console.log(`  phone set (any):               ${stats.phoneAny}  (${((stats.phoneAny/stats.eligibleBaseline)*100).toFixed(1)}%)`);
  console.log(``);
  console.log(`India signals matched (in cohort):`);
  console.log(`  tz == Asia/Kolkata:            ${stats.tzAsiaKolkata}`);
  console.log(`  phone +91:                     ${stats.phoneP91}`);
  console.log(`  razorpay_* id exists:          ${stats.razorpayId}`);
  console.log(`  referral_source ~ india:       ${stats.referralIndia}`);
  console.log(`  UNION (any signal):            ${stats.unionIndia}`);
  console.log(`  UNION not already tz-matched:  ${stats.unionIndia_atLeastOneNonTz}  ← extra users caught by adding new filters`);
  console.log(``);
  console.log(`Top 15 referral_source values in cohort:`);
  const sorted = Object.entries(referralSourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  for (const [k, v] of sorted) console.log(`  ${String(k).padEnd(40)} ${v}`);
  console.log(``);
  console.log(`Sending cohort AFTER union-filter: ${stats.eligibleBaseline - stats.unionIndia}`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
