// Retention reverse-engineering v3 — uses RC V2 API.
//
// V2 differences from V1:
//   - Endpoint: /v2/projects/{project_id}/customers/{uid}
//   - first_seen_at, last_seen_at in ms
//   - active_entitlements.items (empty = churned/no_ent)
//   - /subscriptions endpoint gives starts_at, ends_at, store, status
//
// Cohort: paid users with created_at in last 30-180 days.
// True paid date: from RC subscription starts_at (not Firestore paid_at — that's overwritten).
// Retention: still has active entitlement + tenure ≥ window.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";

const RETENTION_WINDOW_DAYS = 30;
const COHORT_MAX_DAYS_AGO = 180;

interface RCCustomer {
  first_seen_at?: number;
  last_seen_at?: number;
  last_seen_country?: string;
  last_seen_platform?: string;
  active_entitlements?: { items: { entitlement_id: string; expires_at: number }[] };
}

interface RCSubscription {
  starts_at: number;
  ends_at: number;
  current_period_ends_at: number;
  status: string;          // "active", "expired", etc.
  store: string;           // "promotional", "play_store", "app_store"
  gives_access: boolean;
  auto_renewal_status?: string;
}

async function rcCustomer(uid: string): Promise<{ customer: RCCustomer | null; subs: RCSubscription[] }> {
  try {
    const [cRes, sRes] = await Promise.all([
      fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}`,
            { headers: { Authorization: `Bearer ${RC_KEY}` } }),
      fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
            { headers: { Authorization: `Bearer ${RC_KEY}` } }),
    ]);
    if (!cRes.ok || !sRes.ok) return { customer: null, subs: [] };
    const customer = (await cRes.json()) as RCCustomer;
    const subsResponse = (await sRes.json()) as { items: RCSubscription[] };
    return { customer, subs: subsResponse.items ?? [] };
  } catch { return { customer: null, subs: [] }; }
}

async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 50): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  let done = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
      done++;
      if (done % 200 === 0) process.stderr.write(`  ${done}/${items.length}\r`);
    }
  });
  await Promise.all(workers);
  return out;
}

interface UserAnalysis {
  uid: string;
  paidAtMs: number;            // RC subscription starts_at (earliest)
  ageDays: number;
  hasActiveEnt: boolean;
  retained: boolean;
  expired: boolean;
  store: string;
  country: string;
  plan: string;
  paymentProvider: string;
  gender: string | null;
  hairLossLocation: string | null;
  hairGoal: string | null;
  commitmentAnswer: string | null;
  day1Done: boolean;
  day2Done: boolean;
  day3Done: boolean;
  day7Done: boolean;
  daysCompletedWk1: number;
  daysCompletedTotal: number;
  hasDailyLearning: boolean;
  highestDailyLearningDay: number;
  hasSupportNeeds: boolean;
  supportNeedsCount: number;
}

(async () => {
  const now = Date.now();

  // Pull all paid-tagged users (no compound query — composite index missing).
  // We'll filter cohort post-fetch using RC's authoritative starts_at.
  console.log(`Pulling all paidStoppage-tagged users...`);
  const snap = await db
    .collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted).map(d => ({ uid: d.id, data: d.data() }));
  console.log(`Candidates: ${candidates.length}`);

  console.log(`\nFetching RC V2 customer + subscription data (concurrency 50)...`);
  const rcResults = await batch(candidates, async (u) => {
    const rc = await rcCustomer(u.uid);
    return { user: u, rc };
  }, 50);
  process.stderr.write("\n");

  const analyses: UserAnalysis[] = [];
  let skippedNoSubs = 0;
  let skippedNoCustomer = 0;

  for (const { user: u, rc } of rcResults) {
    if (!rc.customer) { skippedNoCustomer++; continue; }
    if (rc.subs.length === 0) { skippedNoSubs++; continue; }
    // Earliest subscription starts_at = first paid moment
    const earliestStart = Math.min(...rc.subs.map(s => s.starts_at));
    const ageDays = Math.floor((now - earliestStart) / 86400000);
    // Cohort filter: only include users whose first paid was in last COHORT_MAX_DAYS_AGO days
    if (ageDays > COHORT_MAX_DAYS_AGO) continue;
    const hasActiveEnt = (rc.customer.active_entitlements?.items?.length ?? 0) > 0;
    const expired = !hasActiveEnt;
    // Pick the most recent subscription's store for context
    const latestSub = rc.subs.sort((a, b) => b.starts_at - a.starts_at)[0];
    const retained = hasActiveEnt && ageDays >= RETENTION_WINDOW_DAYS;

    const progress = (u.data.progress ?? {}) as Record<string, unknown[]>;
    const dayDone = (n: number) => Array.isArray(progress[`day${n}`]) && progress[`day${n}`].length > 0;
    let daysCompletedTotal = 0;
    for (let d = 1; d <= 90; d++) if (dayDone(d)) daysCompletedTotal++;
    const daysCompletedWk1 = [1, 2, 3, 4, 5, 6, 7].filter(dayDone).length;

    const phone = u.data.phone_number ?? u.data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? rc.customer.last_seen_country ?? "—";

    analyses.push({
      uid: u.uid,
      paidAtMs: earliestStart,
      ageDays,
      hasActiveEnt,
      retained,
      expired,
      store: latestSub?.store ?? "—",
      country,
      plan: (u.data.plan as string) ?? "—",
      paymentProvider: (u.data.payment_provider as string) ?? "—",
      gender: (u.data.selected_gender as string) ?? null,
      hairLossLocation: (u.data.hair_loss_location as string) ?? null,
      hairGoal: (u.data.hair_goal as string) ?? null,
      commitmentAnswer: (u.data.commitment_answer as string) ?? null,
      day1Done: dayDone(1),
      day2Done: dayDone(2),
      day3Done: dayDone(3),
      day7Done: dayDone(7),
      daysCompletedWk1,
      daysCompletedTotal,
      hasDailyLearning: typeof u.data.daily_learning_completed_day === "number",
      highestDailyLearningDay: (u.data.daily_learning_completed_day as number) ?? 0,
      hasSupportNeeds: Array.isArray(u.data.support_needs) && (u.data.support_needs as unknown[]).length > 0,
      supportNeedsCount: Array.isArray(u.data.support_needs) ? (u.data.support_needs as unknown[]).length : 0,
    });
  }

  console.log(`Skipped (no RC customer): ${skippedNoCustomer}`);
  console.log(`Skipped (no RC subs):     ${skippedNoSubs}`);
  console.log(`Usable analyses:          ${analyses.length}\n`);

  // Tenure distribution
  const ages = analyses.map(a => a.ageDays).sort((x, y) => x - y);
  if (ages.length > 0) {
    const buckets: Record<string, number> = {};
    for (const a of ages) {
      const k = a < 7 ? "<7d" : a < 14 ? "7-13d" : a < 30 ? "14-29d" : a < 60 ? "30-59d" : a < 90 ? "60-89d" : a < 180 ? "90-179d" : "180+d";
      buckets[k] = (buckets[k] || 0) + 1;
    }
    console.log("Tenure (RC subscription starts_at):");
    for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);
    console.log();
  }

  const eligible = analyses.filter(a => a.ageDays >= RETENTION_WINDOW_DAYS);
  const retained = eligible.filter(a => a.retained);
  const churned = eligible.filter(a => !a.retained);

  console.log(`=== D${RETENTION_WINDOW_DAYS} retention check ===`);
  console.log(`Eligible (paid ≥${RETENTION_WINDOW_DAYS}d ago): ${eligible.length}`);
  console.log(`  Retained: ${retained.length} (${pct(retained.length, eligible.length)}%)`);
  console.log(`  Churned:  ${churned.length} (${pct(churned.length, eligible.length)}%)\n`);

  if (eligible.length < 20) {
    console.log("⚠ Not enough eligible users for lift analysis.");
    console.log("Trying broader window (D14 instead of D30)...");
    // Try D14 fallback
    const eligible14 = analyses.filter(a => a.ageDays >= 14);
    const ret14 = eligible14.filter(a => a.retained);
    console.log(`D14 eligible: ${eligible14.length}, retained: ${ret14.length} (${pct(ret14.length, eligible14.length)}%)`);
    if (eligible14.length < 20) {
      console.log("Still not enough. Exiting.");
      process.exit(0);
    }
    runLiftAnalysis(eligible14, "D14");
    process.exit(0);
  }

  runLiftAnalysis(eligible, `D${RETENTION_WINDOW_DAYS}`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });

function runLiftAnalysis(eligible: UserAnalysis[], label: string) {
  const retained = eligible.filter(a => a.retained);
  const baseRetention = retained.length / eligible.length;

  console.log(`\n=== ${label} retention lift per signal (baseline ${(baseRetention * 100).toFixed(1)}%) ===\n`);
  console.log(
    "Signal".padEnd(40),
    "n_did".padStart(7),
    "ret_did".padStart(9),
    "%".padStart(7),
    "n_didnt".padStart(9),
    "ret_didnt".padStart(11),
    "%".padStart(7),
    "lift".padStart(7),
  );
  console.log("─".repeat(110));

  type BinSig = { name: string; pred: (u: UserAnalysis) => boolean };
  const binarySignals: BinSig[] = [
    { name: "Day 1 progress recorded",       pred: u => u.day1Done },
    { name: "Day 2 progress recorded",       pred: u => u.day2Done },
    { name: "Day 3 progress recorded",       pred: u => u.day3Done },
    { name: "Day 7 progress recorded",       pred: u => u.day7Done },
    { name: "≥3 days done in week 1",        pred: u => u.daysCompletedWk1 >= 3 },
    { name: "≥5 days done in week 1",        pred: u => u.daysCompletedWk1 >= 5 },
    { name: "All 7 days done in week 1",     pred: u => u.daysCompletedWk1 === 7 },
    { name: "Daily learning ever opened",    pred: u => u.hasDailyLearning },
    { name: "Daily learning ≥3",             pred: u => u.highestDailyLearningDay >= 3 },
    { name: "Daily learning ≥7",             pred: u => u.highestDailyLearningDay >= 7 },
    { name: "Daily learning ≥14",            pred: u => u.highestDailyLearningDay >= 14 },
    { name: "Selected ≥1 support needs",     pred: u => u.hasSupportNeeds },
    { name: "Selected ≥3 support needs",     pred: u => u.supportNeedsCount >= 3 },
    { name: "Selected all 6 support needs",  pred: u => u.supportNeedsCount >= 6 },
    { name: "commitment_answer = yes",       pred: u => u.commitmentAnswer === "yes" },
    { name: "hair_goal = both",              pred: u => u.hairGoal === "both" },
    { name: "hair_goal = stop_the_loss",     pred: u => u.hairGoal === "stop_the_loss" },
    { name: "hair_goal = regrow_hair",       pred: u => u.hairGoal === "regrow_hair" },
    { name: "loss_location = crown",         pred: u => u.hairLossLocation === "crown" },
    { name: "loss_location = hairline",      pred: u => u.hairLossLocation === "hairline" },
    { name: "loss_location = all_over",      pred: u => u.hairLossLocation === "all_over" },
    { name: "country = IN",                  pred: u => u.country === "IN" },
    { name: "country = US",                  pred: u => u.country === "US" },
    { name: "payment = razorpay",            pred: u => u.paymentProvider === "razorpay" },
    { name: "payment = rc_billing",          pred: u => u.paymentProvider === "rc_billing" },
    { name: "store = play_store",            pred: u => u.store === "play_store" },
    { name: "store = app_store",             pred: u => u.store === "app_store" },
    { name: "store = promotional",           pred: u => u.store === "promotional" },
    { name: "plan = monthly",                pred: u => u.plan === "monthly" },
    { name: "plan = threeMonth",             pred: u => u.plan === "threeMonth" },
    { name: "plan = weekly",                 pred: u => u.plan === "weekly" },
  ];

  const rows = binarySignals.map(sig => {
    const did = eligible.filter(sig.pred);
    const didnt = eligible.filter(u => !sig.pred(u));
    const retDid = did.filter(u => u.retained).length;
    const retDidnt = didnt.filter(u => u.retained).length;
    const pctDid = did.length > 0 ? retDid / did.length : 0;
    const pctDidnt = didnt.length > 0 ? retDidnt / didnt.length : 0;
    const lift = pctDidnt > 0 ? pctDid / pctDidnt : (pctDid > 0 ? Infinity : 0);
    return { name: sig.name, nDid: did.length, retDid, pctDid: pctDid * 100, nDidnt: didnt.length, retDidnt, pctDidnt: pctDidnt * 100, lift };
  });

  rows.sort((a, b) => b.lift - a.lift);
  for (const r of rows) {
    if (r.nDid < 3) continue;
    console.log(
      r.name.padEnd(40),
      String(r.nDid).padStart(7),
      String(r.retDid).padStart(9),
      `${r.pctDid.toFixed(1)}`.padStart(7),
      String(r.nDidnt).padStart(9),
      String(r.retDidnt).padStart(11),
      `${r.pctDidnt.toFixed(1)}`.padStart(7),
      `${r.lift === Infinity ? "∞" : r.lift.toFixed(2)}x`.padStart(7),
    );
  }

  console.log(`\n=== Retention by days-completed-in-week-1 ===`);
  const wkBuckets: Record<number, { total: number; retained: number }> = {};
  for (let i = 0; i <= 7; i++) wkBuckets[i] = { total: 0, retained: 0 };
  for (const u of eligible) {
    wkBuckets[u.daysCompletedWk1].total++;
    if (u.retained) wkBuckets[u.daysCompletedWk1].retained++;
  }
  for (let i = 0; i <= 7; i++) {
    const b = wkBuckets[i];
    if (b.total === 0) continue;
    const p = pct(b.retained, b.total);
    console.log(`  ${i} days in week 1:  ${String(b.total).padStart(4)} users → ${String(b.retained).padStart(3)} retained (${p}%)`);
  }

  console.log(`\n=== TOP 5 retention drivers (n≥10) ===`);
  const top = rows.filter(r => r.nDid >= 10 && r.lift !== Infinity).sort((a, b) => b.lift - a.lift).slice(0, 5);
  top.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(38)} ${r.lift.toFixed(2)}x lift  (${r.pctDid.toFixed(0)}% retained vs ${r.pctDidnt.toFixed(0)}%)`);
  });

  console.log(`\n=== BOTTOM 5 (anti-signals, n≥10) ===`);
  const bot = rows.filter(r => r.nDid >= 10 && r.lift !== Infinity).sort((a, b) => a.lift - b.lift).slice(0, 5);
  bot.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(38)} ${r.lift.toFixed(2)}x lift  (${r.pctDid.toFixed(0)}% retained vs ${r.pctDidnt.toFixed(0)}%)`);
  });
}

function pct(n: number, d: number): string {
  if (d === 0) return "0";
  return ((n / d) * 100).toFixed(1);
}
