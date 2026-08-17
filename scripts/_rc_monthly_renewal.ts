// RC-based monthly renewal check.
// Detects monthly subscriptions by:
//   - subscription period duration ≈ 28-32 days, OR
//   - product_id matches known monthly product IDs from RC products list
//
// Then asks: how many monthly subscribers stayed past their first month?

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";

// Known monthly product IDs (from /v2/projects/.../products) — anything with P1M duration
// We'll also detect monthly by period length so this list isn't exhaustive-required.
const KNOWN_MONTHLY_PRODUCT_IDS = new Set<string>([
  "prod0fe4eb1c4d",  // KESHAH Standard Monthly
  "prod11047a2960",  // com.keshahapp.hair.monthly:monthly
  "prod1550ef49d0",  // KESHAH Flexible Plan
]);

interface Sub {
  starts_at: number;
  current_period_starts_at: number;
  current_period_ends_at: number;
  ends_at: number;
  status: string;
  store: string;
  product_id?: string | null;
  auto_renewal_status?: string;
}

async function rcSubs(uid: string): Promise<Sub[]> {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
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

const DAY_MS = 86400000;

function periodDays(s: Sub): number {
  return Math.round((s.current_period_ends_at - s.current_period_starts_at) / DAY_MS);
}

function isMonthly(s: Sub): boolean {
  // Match by product_id first
  if (s.product_id && KNOWN_MONTHLY_PRODUCT_IDS.has(s.product_id)) return true;
  // Fall back to period duration: 28-32 days
  const d = periodDays(s);
  return d >= 28 && d <= 32;
}

(async () => {
  const now = Date.now();

  console.log("Pulling all paidStoppage-tagged users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Candidates: ${candidates.length}\n`);

  console.log("Fetching RC subscriptions (concurrency 50)...");
  const results = await batch(candidates, async (d) => {
    const subs = await rcSubs(d.id);
    return { uid: d.id, data: d.data(), subs };
  }, 50);
  process.stderr.write("\n");

  // Each user might have multiple subs across time. Find their monthly ones.
  let usersWithAnySubs = 0;
  let usersWithMonthly = 0;
  let usersWithMonthlyOver35d = 0;

  type MonthlyUser = {
    uid: string;
    earliestMonthlyStart: number;
    latestEnd: number;
    totalDurationDays: number;
    activeNow: boolean;
    renewed: boolean;
    daysCompletedWk1: number;
    highestDailyLearningDay: number;
    plan: string;
    country: string;
    productId: string;
  };
  const monthlyUsers: MonthlyUser[] = [];

  for (const r of results) {
    if (r.subs.length === 0) continue;
    usersWithAnySubs++;

    const monthlySubs = r.subs.filter(isMonthly);
    if (monthlySubs.length === 0) continue;
    usersWithMonthly++;

    // Earliest monthly start, latest end
    const earliestStart = Math.min(...monthlySubs.map(s => s.starts_at));
    const latestEnd = Math.max(...monthlySubs.map(s => s.ends_at));
    const ageDays = Math.floor((now - earliestStart) / DAY_MS);
    const totalDurationDays = Math.round((latestEnd - earliestStart) / DAY_MS);
    // Active now: any monthly sub still active and not yet expired
    const activeNow = monthlySubs.some(s => s.ends_at > now && s.status === "active");
    // Renewed: subscription has had >1 period, detected by:
    //   (a) any sub where current_period_starts_at > starts_at, OR
    //   (b) total duration > 35 days (covers cases where RC merged renewals)
    const renewed =
      monthlySubs.some(s => s.current_period_starts_at > s.starts_at) ||
      totalDurationDays > 35 ||
      monthlySubs.length > 1;

    if (ageDays >= 35) usersWithMonthlyOver35d++;

    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    const dayDone = (n: number) => Array.isArray(progress[`day${n}`]) && progress[`day${n}`].length > 0;
    const daysCompletedWk1 = [1, 2, 3, 4, 5, 6, 7].filter(dayDone).length;

    const phone = r.data.phone_number ?? r.data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? "—";

    monthlyUsers.push({
      uid: r.uid,
      earliestMonthlyStart: earliestStart,
      latestEnd,
      totalDurationDays,
      activeNow,
      renewed,
      daysCompletedWk1,
      highestDailyLearningDay: (r.data.daily_learning_completed_day as number) ?? 0,
      plan: (r.data.plan as string) ?? (r.data.razorpay_plan as string) ?? "—",
      country,
      productId: monthlySubs[0]?.product_id ?? "—",
    });
  }

  console.log(`=== RC monthly subscription scan ===`);
  console.log(`Users with any RC subs:               ${usersWithAnySubs}`);
  console.log(`Users with monthly subs (1M period):  ${monthlyUsers.length}`);
  console.log(`  → with monthly tenure ≥35d:          ${usersWithMonthlyOver35d}\n`);

  // Cohort filter: monthly subscribers eligible for M1→M2 renewal check
  const eligible = monthlyUsers.filter(u => Math.floor((now - u.earliestMonthlyStart) / DAY_MS) >= 35);

  if (eligible.length === 0) {
    console.log("⚠ No monthly subscribers ≥35 days old. Try wider cohort.");
    // Show distribution of monthly tenures
    const tenures = monthlyUsers.map(u => Math.floor((now - u.earliestMonthlyStart) / DAY_MS)).sort((a, b) => a - b);
    if (tenures.length > 0) {
      const buckets: Record<string, number> = {};
      for (const a of tenures) {
        const k = a < 7 ? "<7d" : a < 14 ? "7-13d" : a < 30 ? "14-29d" : a < 60 ? "30-59d" : a < 90 ? "60-89d" : a < 180 ? "90-179d" : "180+d";
        buckets[k] = (buckets[k] || 0) + 1;
      }
      console.log("Monthly subscriber tenure distribution:");
      for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);
    }
    process.exit(0);
  }

  const renewers = eligible.filter(u => u.renewed);
  const m1ChurnedAt = eligible.filter(u => !u.renewed);

  console.log(`=== Eligible monthly subscribers (≥35d tenure): ${eligible.length} ===`);
  console.log(`  Renewed past M1:        ${renewers.length} (${pct(renewers.length, eligible.length)}%)`);
  console.log(`  Churned at M1 (1 cycle): ${m1ChurnedAt.length} (${pct(m1ChurnedAt.length, eligible.length)}%)\n`);

  // Tenure distribution of renewers
  const renewerTenures = renewers.map(u => Math.floor((now - u.earliestMonthlyStart) / DAY_MS)).sort((a, b) => a - b);
  if (renewerTenures.length > 0) {
    console.log("Renewer tenure distribution (months past M1):");
    const buckets: Record<string, number> = {};
    for (const a of renewerTenures) {
      const k = a < 60 ? "M1-M2" : a < 90 ? "M2-M3" : a < 120 ? "M3-M4" : a < 180 ? "M4-M6" : a < 365 ? "M6-M12" : "M12+";
      buckets[k] = (buckets[k] || 0) + 1;
    }
    for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);
  }

  // Behavior comparison
  console.log(`\n=== Behavior comparison: M1-renewers vs M1-churners ===`);
  console.log(`Avg week-1 days completed:`);
  console.log(`  Renewers:     ${avg(renewers.map(u => u.daysCompletedWk1)).toFixed(1)}`);
  console.log(`  M1-churners:  ${avg(m1ChurnedAt.map(u => u.daysCompletedWk1)).toFixed(1)}`);
  console.log(`Avg highest daily learning day:`);
  console.log(`  Renewers:     ${avg(renewers.map(u => u.highestDailyLearningDay)).toFixed(1)}`);
  console.log(`  M1-churners:  ${avg(m1ChurnedAt.map(u => u.highestDailyLearningDay)).toFixed(1)}`);

  console.log(`\n=== Days-completed-in-week-1 by outcome ===`);
  console.log(`Days   Renewers   M1-churners   Renewal rate`);
  for (let d = 0; d <= 7; d++) {
    const ren = renewers.filter(u => u.daysCompletedWk1 === d).length;
    const chu = m1ChurnedAt.filter(u => u.daysCompletedWk1 === d).length;
    const rate = (ren + chu) > 0 ? pct(ren, ren + chu) : "—";
    console.log(`  ${d}      ${String(ren).padStart(4)}        ${String(chu).padStart(4)}              ${rate}%`);
  }

  // By country
  console.log(`\n=== Renewal rate by country ===`);
  const countries = [...new Set(eligible.map(u => u.country))].sort();
  for (const c of countries) {
    const sub = eligible.filter(u => u.country === c);
    const r = sub.filter(u => u.renewed).length;
    if (sub.length < 3) continue;
    console.log(`  ${c}: ${r}/${sub.length} = ${pct(r, sub.length)}%`);
  }

  // By product_id
  console.log(`\n=== Renewal rate by RC product_id ===`);
  const products = [...new Set(eligible.map(u => u.productId))].sort();
  for (const p of products) {
    const sub = eligible.filter(u => u.productId === p);
    const r = sub.filter(u => u.renewed).length;
    if (sub.length < 3) continue;
    console.log(`  ${p}: ${r}/${sub.length} = ${pct(r, sub.length)}%`);
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
