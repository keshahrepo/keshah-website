// Experiment MDE analyzer.
//
// Pulls daily installs (from Firestore Users.created_at) and daily paid
// conversions (from RC subscriptions), computes baseline mean + stddev,
// then reports the Minimum Detectable Effect (MDE) at various time windows.
//
// Answers: "we started experiment X on day D — how many more days until we
// can confidently say it worked or didn't?"
//
// Usage:
//   set -a && source .env.local && set +a && npx tsx scripts/_experiment_mde.ts
//   set -a && source .env.local && set +a && npx tsx scripts/_experiment_mde.ts --split 2026-08-04
//     (compares pre-split vs post-split window)

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";

// ── args ────────────────────────────────────────────────────────────
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  const k = process.argv[i];
  if (k.startsWith("--")) { args.set(k.slice(2), process.argv[i + 1] ?? "true"); i++; }
}
const LOOKBACK_DAYS = parseInt(args.get("days") ?? "60", 10);
const SPLIT_DATE = args.get("split");  // ISO date "2026-08-04"
const TODAY = new Date();

function dayKey(d: Date | number): string {
  const t = typeof d === "number" ? new Date(d * 1000) : d;
  return t.toISOString().split("T")[0];
}

function stats(xs: number[]): { n: number; mean: number; stddev: number; min: number; max: number } {
  const n = xs.length;
  if (n === 0) return { n: 0, mean: 0, stddev: 0, min: 0, max: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { n, mean, stddev: Math.sqrt(variance), min: Math.min(...xs), max: Math.max(...xs) };
}

// MDE formula (simplified, 80% power, 95% confidence, 2-sided z=1.96 + z=0.84 = 2.8):
// Required days ≈ (2.8 × stddev / (mean × lift))² × 2  (2 sample arms conceptually)
function daysToDetect(mean: number, stddev: number, liftPct: number): number {
  if (mean === 0) return Infinity;
  const targetDelta = mean * liftPct;
  const denom = targetDelta ** 2;
  // Simplified: n days per arm needed so that noise floor drops below signal
  // n = (Z_α + Z_β)² × 2σ² / δ²   where δ = mean*lift
  return Math.ceil((2.8 ** 2 * 2 * stddev ** 2) / denom);
}

async function pullDailyInstalls(days: number): Promise<Map<string, number>> {
  const since = new Date(Date.now() - days * 86400_000);
  const snap = await db.collection("Users").where("created_at", ">=", since).get();
  const daily = new Map<string, number>();
  for (const doc of snap.docs) {
    const x = doc.data() as any;
    const t = x.created_at?.toDate?.() ?? (typeof x.created_at === "string" ? new Date(x.created_at) : null);
    if (!t) continue;
    const k = dayKey(t);
    daily.set(k, (daily.get(k) ?? 0) + 1);
  }
  return daily;
}

async function pullDailyPaidConversions(days: number): Promise<Map<string, number>> {
  // Paid conversions = users with paid_at set in the last N days
  const since = new Date(Date.now() - days * 86400_000);
  const snap = await db.collection("Users").where("paid_at", ">=", since).get();
  const daily = new Map<string, number>();
  for (const doc of snap.docs) {
    const x = doc.data() as any;
    const t = x.paid_at?.toDate?.() ?? (typeof x.paid_at === "string" ? new Date(x.paid_at) : null);
    if (!t) continue;
    const k = dayKey(t);
    daily.set(k, (daily.get(k) ?? 0) + 1);
  }
  return daily;
}

function fillMissingDays(daily: Map<string, number>, days: number): number[] {
  const out: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    out.push(daily.get(dayKey(d)) ?? 0);
  }
  return out;
}

function report(label: string, series: number[]) {
  const s = stats(series);
  const rolling7 = series.slice(-7).reduce((a, b) => a + b, 0) / 7;
  const rolling30 = series.slice(-30).reduce((a, b) => a + b, 0) / Math.min(30, series.length);
  console.log(`\n── ${label} ──`);
  console.log(`  days:       ${s.n}`);
  console.log(`  mean/day:   ${s.mean.toFixed(1)}`);
  console.log(`  stddev/day: ${s.stddev.toFixed(1)}  (CV = ${(s.stddev / (s.mean || 1)).toFixed(2)})`);
  console.log(`  min–max:    ${s.min} – ${s.max}`);
  console.log(`  rolling 7d: ${rolling7.toFixed(1)}/day`);
  console.log(`  rolling 30d:${rolling30.toFixed(1)}/day`);
  console.log(`\n  MDE (days needed to detect lift at 95% conf, 80% power):`);
  for (const lift of [0.10, 0.20, 0.30, 0.50, 1.0, 2.0]) {
    const d = daysToDetect(s.mean, s.stddev, lift);
    const flag = d <= 14 ? "✓" : d <= 60 ? "○" : "✗";
    console.log(`     ${flag}  ${(lift * 100).toString().padStart(4)}% lift  →  ${d} days`);
  }
}

function compareSplit(label: string, series: number[], splitISO: string) {
  const splitIdx = series.length - Math.floor((TODAY.getTime() - new Date(splitISO).getTime()) / 86400_000);
  if (splitIdx <= 3 || splitIdx >= series.length - 1) return;
  const pre = series.slice(0, splitIdx);
  const post = series.slice(splitIdx);
  const preS = stats(pre);
  const postS = stats(post);
  const lift = preS.mean === 0 ? 0 : (postS.mean - preS.mean) / preS.mean;
  // 2-sample t-like z (rough): (μ2 - μ1) / sqrt(σ1²/n1 + σ2²/n2)
  const se = Math.sqrt(preS.stddev ** 2 / preS.n + postS.stddev ** 2 / postS.n);
  const z = se === 0 ? 0 : (postS.mean - preS.mean) / se;
  console.log(`\n  ── SPLIT COMPARISON at ${splitISO} ──`);
  console.log(`     pre  (${preS.n}d):  mean=${preS.mean.toFixed(1)} ± ${preS.stddev.toFixed(1)}`);
  console.log(`     post (${postS.n}d): mean=${postS.mean.toFixed(1)} ± ${postS.stddev.toFixed(1)}`);
  console.log(`     observed lift: ${(lift * 100).toFixed(1)}%`);
  console.log(`     z-score:       ${z.toFixed(2)}  ${Math.abs(z) < 1.96 ? "(NOT significant — within noise)" : "(SIGNIFICANT — real signal)"}`);
  if (Math.abs(z) < 1.96 && lift > 0) {
    // Days needed to reach significance IF current trend holds
    const daysNeeded = daysToDetect(preS.mean, preS.stddev, lift);
    console.log(`     if lift is real at ${(lift * 100).toFixed(1)}%, need ~${daysNeeded} total post-split days (currently ${postS.n})`);
  }
}

(async () => {
  console.log(`Pulling last ${LOOKBACK_DAYS} days of installs + paid conversions from Firestore…`);
  const [installs, paid] = await Promise.all([
    pullDailyInstalls(LOOKBACK_DAYS),
    pullDailyPaidConversions(LOOKBACK_DAYS),
  ]);
  const iSeries = fillMissingDays(installs, LOOKBACK_DAYS);
  const pSeries = fillMissingDays(paid, LOOKBACK_DAYS);

  report("INSTALLS", iSeries);
  if (SPLIT_DATE) compareSplit("INSTALLS", iSeries, SPLIT_DATE);

  report("PAID CONVERSIONS", pSeries);
  if (SPLIT_DATE) compareSplit("PAID CONVERSIONS", pSeries, SPLIT_DATE);

  console.log(`\n✓ Done. Tips:`);
  console.log(`  Add --split YYYY-MM-DD to compare pre vs post an experiment start date`);
  console.log(`  Add --days N to look further back (default 60)`);
  console.log(`  ✓/○/✗ marks: ≤14d/≤60d/longer to detect lift`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
