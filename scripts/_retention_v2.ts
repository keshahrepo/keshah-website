// Retention reverse-engineering v2.
// Uses RC's original_purchase_date_ms as the authoritative first-paid timestamp,
// since Firestore's paid_at is overwritten on every save-profile call.
//
// Cohort definition: RC original_purchase_date_ms ≥ N days ago.
// Retention: still has active paid entitlement today.
// Behavior: extracted from Firestore Users doc (progress.dayN, etc.).

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const RETENTION_WINDOW_DAYS = 30;

interface RCSubscriber {
  subscriber?: {
    original_purchase_date_ms?: number;
    original_purchase_date?: string;
    entitlements?: Record<string, { expires_date?: string; product_identifier?: string }>;
    subscriptions?: Record<string, {
      period_type?: string;
      original_purchase_date?: string;
      purchase_date?: string;
      expires_date?: string;
    }>;
  };
}

async function rcSubscriber(uid: string): Promise<RCSubscriber | null> {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
    if (!res.ok) return null;
    return (await res.json()) as RCSubscriber;
  } catch { return null; }
}

async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 40): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

interface UserAnalysis {
  uid: string;
  retained: boolean;
  ageDays: number;
  rcCategory: string;
  country: string;
  plan: string;
  paymentProvider: string;
  gender: string | null;
  hairLossLocation: string | null;
  hairGoal: string | null;
  commitmentAnswer: string | null;
  referralSource: string | null;
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

  // Pull every user that has a RC-eligible signal: razorpay_subscription_id OR payment_provider set
  // OR extra_user_tags includes "paidStoppage". We'll filter post-fetch by RC original_purchase_date.
  console.log("Pulling all paid-tagged users from Firestore...");
  const snap = await db
    .collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted).map(d => ({ uid: d.id, data: d.data() }));
  console.log(`Candidates with paidStoppage tag: ${candidates.length}`);

  console.log(`\nFetching RC entitlement state (concurrency 40)...`);
  const rcResults = await batch(candidates, async (u) => {
    const sub = await rcSubscriber(u.uid);
    return { user: u, sub };
  }, 40);

  // Compute analysis records
  const analyses: UserAnalysis[] = [];
  let skippedNoRC = 0;
  let skippedNoPurchase = 0;

  for (const { user: u, sub } of rcResults) {
    if (!sub?.subscriber) { skippedNoRC++; continue; }
    const opmsRaw = sub.subscriber.original_purchase_date_ms;
    const opms = typeof opmsRaw === "number" ? opmsRaw : (opmsRaw ? Number(opmsRaw) : 0);
    const opd = sub.subscriber.original_purchase_date;
    let firstPaidMs = opms;
    if (!firstPaidMs && opd) firstPaidMs = new Date(opd).getTime();
    if (!firstPaidMs) {
      // Fall back to earliest subscription original_purchase_date
      const subs = sub.subscriber.subscriptions ?? {};
      let earliest = Infinity;
      for (const s of Object.values(subs)) {
        if (s.original_purchase_date) {
          const t = new Date(s.original_purchase_date).getTime();
          if (t < earliest) earliest = t;
        }
      }
      if (earliest !== Infinity) firstPaidMs = earliest;
    }
    if (!firstPaidMs) { skippedNoPurchase++; continue; }

    const ageDays = Math.floor((now - firstPaidMs) / 86400000);

    // Current entitlement state
    const ent = sub.subscriber.entitlements?.stoppage_treatment;
    const stillActive = ent?.expires_date ? new Date(ent.expires_date).getTime() > now : false;
    const productId = ent?.product_identifier;
    const periodType = productId ? sub.subscriber.subscriptions?.[productId]?.period_type : undefined;

    let rcCategory = "no_entitlement";
    if (ent && stillActive) {
      if (productId?.includes("rc_promo")) rcCategory = "web_promo_grant";
      else if (periodType === "trial") rcCategory = "active_trial";
      else if (periodType === "intro") rcCategory = "active_intro";
      else rcCategory = "active_paid";
    } else if (ent && !stillActive) {
      rcCategory = "expired";
    }

    const retained = rcCategory === "active_paid";

    // Behavior
    const progress = (u.data.progress ?? {}) as Record<string, unknown[]>;
    const dayDone = (n: number) => Array.isArray(progress[`day${n}`]) && progress[`day${n}`].length > 0;
    let daysCompletedTotal = 0;
    for (let d = 1; d <= 90; d++) if (dayDone(d)) daysCompletedTotal++;
    const daysCompletedWk1 = [1, 2, 3, 4, 5, 6, 7].filter(dayDone).length;

    const phone = u.data.phone_number ?? u.data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? "—";

    analyses.push({
      uid: u.uid,
      retained,
      ageDays,
      rcCategory,
      country,
      plan: (u.data.plan as string) ?? "—",
      paymentProvider: (u.data.payment_provider as string) ?? "—",
      gender: (u.data.selected_gender as string) ?? null,
      hairLossLocation: (u.data.hair_loss_location as string) ?? null,
      hairGoal: (u.data.hair_goal as string) ?? null,
      commitmentAnswer: (u.data.commitment_answer as string) ?? null,
      referralSource: (u.data.referral_source as string) ?? null,
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

  console.log(`Skipped (no RC subscriber):     ${skippedNoRC}`);
  console.log(`Skipped (no original purchase): ${skippedNoPurchase}`);
  console.log(`Usable analyses:                ${analyses.length}\n`);

  // Age distribution
  const ages = analyses.map(a => a.ageDays).sort((a, b) => a - b);
  if (ages.length > 0) {
    const buckets: Record<string, number> = {};
    for (const a of ages) {
      const k = a < 7 ? "<7d" : a < 14 ? "7-13d" : a < 30 ? "14-29d" : a < 60 ? "30-59d" : a < 90 ? "60-89d" : a < 180 ? "90-179d" : "180+d";
      buckets[k] = (buckets[k] || 0) + 1;
    }
    console.log("Tenure distribution (RC original_purchase_date):");
    for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);
    console.log();
  }

  // Cohort
  const eligible = analyses.filter(a => a.ageDays >= RETENTION_WINDOW_DAYS);
  const retained = eligible.filter(a => a.retained);
  const churned = eligible.filter(a => !a.retained);

  console.log(`=== D${RETENTION_WINDOW_DAYS} retention check ===`);
  console.log(`Eligible (paid ≥${RETENTION_WINDOW_DAYS}d ago): ${eligible.length}`);
  console.log(`  Retained (active_paid): ${retained.length} (${pct(retained.length, eligible.length)}%)`);
  console.log(`  Churned (other):        ${churned.length} (${pct(churned.length, eligible.length)}%)\n`);

  if (eligible.length < 10) {
    console.log("⚠ Not enough eligible users for lift analysis.");
    process.exit(0);
  }

  // Distribution of churned by category
  console.log("Churned breakdown by RC category:");
  const churnCats: Record<string, number> = {};
  for (const c of churned) churnCats[c.rcCategory] = (churnCats[c.rcCategory] || 0) + 1;
  Object.entries(churnCats).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(22)}: ${v}`));

  const baseRetention = retained.length / eligible.length;

  // ─── Lift per binary signal ────────────────────────────────────────────
  console.log(`\n=== Retention lift per signal (baseline ${(baseRetention * 100).toFixed(1)}%) ===\n`);
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
    { name: "plan = monthly",                pred: u => u.plan === "monthly" },
    { name: "plan = threeMonth",             pred: u => u.plan === "threeMonth" },
    { name: "plan = weekly",                 pred: u => u.plan === "weekly" },
  ];

  type LiftRow = {
    name: string;
    nDid: number;
    retDid: number;
    pctDid: number;
    nDidnt: number;
    retDidnt: number;
    pctDidnt: number;
    lift: number;
  };

  const rows: LiftRow[] = [];
  for (const sig of binarySignals) {
    const did = eligible.filter(sig.pred);
    const didnt = eligible.filter(u => !sig.pred(u));
    const retDid = did.filter(u => u.retained).length;
    const retDidnt = didnt.filter(u => u.retained).length;
    const pctDid = did.length > 0 ? retDid / did.length : 0;
    const pctDidnt = didnt.length > 0 ? retDidnt / didnt.length : 0;
    const lift = pctDidnt > 0 ? pctDid / pctDidnt : (pctDid > 0 ? Infinity : 0);
    rows.push({
      name: sig.name,
      nDid: did.length, retDid, pctDid: pctDid * 100,
      nDidnt: didnt.length, retDidnt, pctDidnt: pctDidnt * 100,
      lift,
    });
  }

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

  // ─── Continuous distribution: days completed in week 1 ────────────────
  console.log(`\n=== Retention by days-completed-in-week-1 (continuous) ===`);
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

  // ─── Top drivers ───────────────────────────────────────────────────────
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

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });

function pct(n: number, d: number): string {
  if (d === 0) return "0";
  return ((n / d) * 100).toFixed(1);
}
