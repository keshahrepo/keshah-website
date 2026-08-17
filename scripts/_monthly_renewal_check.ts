// Specifically: monthly subscribers — who stayed past their first 30 days?
//
// "Stayed past first month" = at least one renewal cycle completed.
// Detected by:
//   - subscription.current_period_starts_at > subscription.starts_at  (new period started → renewal fired)
//   - OR subscription duration (ends_at - starts_at) > ~35 days
//
// Plus: behavior comparison between renewers vs first-month-only users.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";

interface Sub {
  starts_at: number;
  current_period_starts_at: number;
  current_period_ends_at: number;
  ends_at: number;
  status: string;
  store: string;
  auto_renewal_status?: string;
}

async function rcSubs(uid: string): Promise<Sub[]> {
  try {
    const res = await fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } });
    if (!res.ok) return [];
    const data = (await res.json()) as { items: Sub[] };
    return data.items ?? [];
  } catch { return []; }
}

async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 50): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
      done++;
      if (done % 500 === 0) process.stderr.write(`  ${done}/${items.length}\r`);
    }
  }));
  return out;
}

(async () => {
  const now = Date.now();

  // Pull all paidStoppage-tagged users (filter to those with plan = monthly post-fetch)
  console.log("Pulling paid users with plan = monthly* ...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const allDocs = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total paid-tagged: ${allDocs.length}`);

  // Filter to monthly plan users (any of monthly, monthlyV2, monthlyPremium, monthlyPremium996)
  const monthly = allDocs.filter(d => {
    const plan = d.data().plan as string | undefined;
    const rzpPlan = d.data().razorpay_plan as string | undefined;
    return (
      ["monthly", "monthlyV2", "monthlyPremium", "monthlyPremium996"].includes(plan ?? "") ||
      ["monthly", "monthlyV2", "monthlyPremium", "monthlyPremium996"].includes(rzpPlan ?? "")
    );
  });
  console.log(`Filtered to monthly plan: ${monthly.length}\n`);

  console.log(`Fetching RC subscriptions (concurrency 50)...`);
  const results = await batch(monthly, async (d) => {
    const subs = await rcSubs(d.id);
    return { uid: d.id, data: d.data(), subs };
  }, 50);
  process.stderr.write("\n");

  // Classify
  let noSubs = 0;
  let firstPeriodOnly_active = 0;        // still in first period, hasn't renewed yet, active
  let firstPeriodOnly_expired = 0;        // first period expired before renewal — CHURNED at end of M1
  let renewed = 0;                         // subscription has renewed at least once
  let renewed_active = 0;
  let renewed_expired = 0;

  type Row = { uid: string; ageDays: number; renewed: boolean; active: boolean; daysCompletedWk1: number; highestDailyLearningDay: number };
  const rows: Row[] = [];

  for (const r of results) {
    if (r.subs.length === 0) { noSubs++; continue; }
    // Earliest start
    const earliest = Math.min(...r.subs.map(s => s.starts_at));
    const ageDays = Math.floor((now - earliest) / 86400000);
    // Has any subscription with current_period_starts_at > starts_at? (= renewed)
    const hasRenewed = r.subs.some(s => s.current_period_starts_at > s.starts_at);
    // Or cumulative duration > 35 days (handles cases where RC merged renewals)
    const longDuration = r.subs.some(s => (s.current_period_ends_at - s.starts_at) > 35 * 86400000);
    const renewedFlag = hasRenewed || longDuration;
    // Active: any subscription where ends_at > now AND status active
    const isActive = r.subs.some(s => s.ends_at > now && s.status === "active");

    if (renewedFlag) {
      renewed++;
      if (isActive) renewed_active++;
      else renewed_expired++;
    } else {
      // First period only
      if (isActive) firstPeriodOnly_active++;
      else firstPeriodOnly_expired++;
    }

    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    const dayDone = (n: number) => Array.isArray(progress[`day${n}`]) && progress[`day${n}`].length > 0;
    const daysCompletedWk1 = [1, 2, 3, 4, 5, 6, 7].filter(dayDone).length;

    rows.push({
      uid: r.uid,
      ageDays,
      renewed: renewedFlag,
      active: isActive,
      daysCompletedWk1,
      highestDailyLearningDay: (r.data.daily_learning_completed_day as number) ?? 0,
    });
  }

  console.log(`=== Monthly subscriber outcomes ===`);
  console.log(`Skipped (no RC subs):         ${noSubs}`);
  console.log(`First period only — active:   ${firstPeriodOnly_active}    (still in M1, not renewed yet)`);
  console.log(`First period only — expired:  ${firstPeriodOnly_expired}    (CHURNED at end of M1)`);
  console.log(`Renewed (≥M2 reached):        ${renewed}    (active=${renewed_active}, expired=${renewed_expired})`);

  // Of those eligible (paid ≥35 days ago — should have had a renewal opportunity)
  const eligible = rows.filter(r => r.ageDays >= 35);
  if (eligible.length > 0) {
    const renewedEligible = eligible.filter(r => r.renewed);
    const churnedAtM1 = eligible.filter(r => !r.renewed);
    console.log(`\nEligible for M1 renewal check (paid ≥35d ago): ${eligible.length}`);
    console.log(`  ${renewedEligible.length} (${pct(renewedEligible.length, eligible.length)}%) renewed (stayed past M1)`);
    console.log(`  ${churnedAtM1.length} (${pct(churnedAtM1.length, eligible.length)}%) churned at end of M1`);

    // Behavior comparison
    const renewedAvgWk1 = avg(renewedEligible.map(r => r.daysCompletedWk1));
    const churnedAvgWk1 = avg(churnedAtM1.map(r => r.daysCompletedWk1));
    const renewedAvgDL = avg(renewedEligible.map(r => r.highestDailyLearningDay));
    const churnedAvgDL = avg(churnedAtM1.map(r => r.highestDailyLearningDay));
    console.log(`\nBehavior comparison:`);
    console.log(`  Renewers — avg week-1 days done:        ${renewedAvgWk1.toFixed(1)}`);
    console.log(`  Churned at M1 — avg week-1 days done:   ${churnedAvgWk1.toFixed(1)}`);
    console.log(`  Renewers — avg highest daily learning:  ${renewedAvgDL.toFixed(1)}`);
    console.log(`  Churned at M1 — avg highest daily learning: ${churnedAvgDL.toFixed(1)}`);

    // Days-done distribution for renewers vs churners
    console.log(`\nDays-completed-in-week-1 by outcome:`);
    console.log(`  Days   Renewers   Churned-at-M1   Renewal rate`);
    for (let d = 0; d <= 7; d++) {
      const ren = renewedEligible.filter(r => r.daysCompletedWk1 === d).length;
      const chu = churnedAtM1.filter(r => r.daysCompletedWk1 === d).length;
      const rate = (ren + chu) > 0 ? pct(ren, ren + chu) : "—";
      console.log(`  ${d}      ${String(ren).padStart(4)}       ${String(chu).padStart(4)}            ${rate}%`);
    }
  } else {
    console.log("\n⚠ No monthly subscribers ≥35 days old. Try widening cohort.");
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });

function pct(n: number, d: number): string {
  if (d === 0) return "0";
  return ((n / d) * 100).toFixed(1);
}
function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
