// Which user attributes correlate with trial→paid conversion?
// Scan the +162 cohort (Aug 18 → today - 4 days so everyone had a
// full trial window), split converted vs cancelled, and rank each
// attribute by the biggest conversion-rate delta.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const TEST_EMAIL = /^test\d+@test\.com$/i;
// +162 launch cohort. Cutoff is 10 days back so every signup had time
// for the 7-day trial + refund window + webhook buffer.
const COHORT_FROM = new Date("2026-08-18T00:00:00Z");
const COHORT_TO = new Date(Date.now() - 10 * 86_400_000);

const ATTRIBUTES: Array<{ key: string; label: string; unknownIsMeaningful?: boolean }> = [
  { key: "selected_gender", label: "Gender" },
  { key: "country_tier", label: "Country tier" },
  { key: "install_source", label: "Install source" },
  { key: "referral_source", label: "Referral source" },
  { key: "age_range", label: "Age" },
  { key: "hair_loss_location", label: "Hair loss location" },
  { key: "hair_goal", label: "Hair goal" },
  { key: "pinch_test_answer", label: "Pinch test" },
  { key: "commitment_answer", label: "Commitment" },
  { key: "hair_loss_severity", label: "Hair loss severity" },
  { key: "family_history", label: "Family history" },
  { key: "stress_frequency", label: "Stress freq (women)" },
  { key: "recent_stress_event", label: "Recent stress event (women)" },
  { key: "hair_loss_timing", label: "Hair loss timing (women)" },
  { key: "hair_loss_rate", label: "Hair loss rate (women)" },
];

(async () => {
  const snap = await db.collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(COHORT_FROM))
    .where("created_at", "<=", Timestamp.fromDate(COHORT_TO))
    .get();

  console.log(`Cohort: signups Aug 18 → ${COHORT_TO.toISOString().slice(0,10)}: ${snap.size} users\n`);

  // Denominator = every signup (not just trial-starters). "Converted
  // to paid" = the RC webhook wrote converted_at (trial → subscription).
  // Uses converted_at only (NOT converted_trial, which was set on the
  // paywall tap and inflated numbers with 3-day-trial folks).
  interface U {
    converted: boolean;
    attrs: Record<string, unknown>;
  }
  const users: U[] = [];
  for (const d of snap.docs) {
    const u:any = d.data();
    if (u.is_deleted) continue;
    if (typeof u.email === "string" && TEST_EMAIL.test(u.email)) continue;
    // Paid = converted_at set (canonical RC webhook signal) OR pro=true
    // fallback (catches early-Aug users whose webhook fired before the
    // converted_at handler was deployed, plus Stripe-web trials whose
    // Stripe-webhook wiring is still in progress).
    const converted = u.converted_at != null || u.pro === true;
    const attrs: Record<string, unknown> = {};
    for (const a of ATTRIBUTES) attrs[a.key] = u[a.key];
    users.push({ converted, attrs });
  }

  const totalUsers = users.length;
  const totalConverted = users.filter(u => u.converted).length;
  const baseRate = totalConverted / totalUsers;
  console.log(`All signups: ${totalUsers}   Paid: ${totalConverted}   Signup → paid rate: ${(baseRate*100).toFixed(2)}%\n`);
  console.log(`=== Attribute breakdown (min 15 users per value) ===\n`);

  const findings: Array<{ label: string; value: string; n: number; conv: number; rate: number; delta: number }> = [];

  for (const a of ATTRIBUTES) {
    const byVal: Record<string, { n: number; conv: number }> = {};
    for (const u of users) {
      const raw = u.attrs[a.key];
      const v = raw == null || raw === "" ? "(unset)" : String(raw);
      if (!byVal[v]) byVal[v] = { n: 0, conv: 0 };
      byVal[v].n++;
      if (u.converted) byVal[v].conv++;
    }
    console.log(`\n${a.label}`);
    const sorted = Object.entries(byVal).sort((a,b) => b[1].n - a[1].n);
    for (const [val, { n, conv }] of sorted) {
      if (n < 5) continue;
      const rate = conv / n;
      const delta = rate - baseRate;
      const arrow = delta > 0 ? "↑" : "↓";
      console.log(`  ${val.padEnd(28)}  n=${String(n).padStart(4)}  conv=${String(conv).padStart(3)}  rate=${(rate*100).toFixed(1).padStart(5)}%  ${arrow}${(delta*100).toFixed(1).padStart(5)}pp`);
      if (n >= 15) findings.push({ label: a.label, value: val, n, conv, rate, delta });
    }
  }

  console.log(`\n\n=== TOP 20 winners (highest paid rate above base, min n=30) ===\n`);
  const winners = findings.filter(f => f.delta > 0 && f.n >= 30).sort((a,b) => b.delta - a.delta).slice(0, 20);
  for (const f of winners) {
    console.log(`  ${f.label.padEnd(24)}  ${f.value.padEnd(28)}  ${(f.rate*100).toFixed(2).padStart(5)}%  (base ${(baseRate*100).toFixed(2)}%, +${(f.delta*100).toFixed(2)}pp, n=${f.n})`);
  }

  console.log(`\n=== TOP 20 losers (biggest below base, min n=30) ===\n`);
  const losers = findings.filter(f => f.delta < 0 && f.n >= 30).sort((a,b) => a.delta - b.delta).slice(0, 20);
  for (const f of losers) {
    console.log(`  ${f.label.padEnd(24)}  ${f.value.padEnd(28)}  ${(f.rate*100).toFixed(2).padStart(5)}%  (base ${(baseRate*100).toFixed(2)}%, ${(f.delta*100).toFixed(2)}pp, n=${f.n})`);
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
