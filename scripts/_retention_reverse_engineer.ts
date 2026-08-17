// Retention reverse-engineering: what early actions predict M2 retention?
//
// Approach:
// 1. Cohort: users who paid ≥60 days ago (eligible for M2 retention check)
// 2. For each, query RC API → classify as still-paying vs churned
// 3. For each, extract behavior vector from week 1
// 4. Compute lift per signal: P(retained | did X) / P(retained baseline)
//
// Output: ranked list of week-1 actions by retention lift, so we know
// which behaviors to engineer onboarding around.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

// Tuneable: KESHAH launched ~67 days ago, so D30 is the deepest realistic window
// for cohort size. D60 ran out of users.
const RETENTION_WINDOW_DAYS = 30;
const COHORT_MIN_DAYS_AGO = RETENTION_WINDOW_DAYS;
const COHORT_MAX_DAYS_AGO = 365;
const WEEK_1_DAYS = 7;

interface RCSub {
  subscriber?: {
    entitlements?: Record<string, { expires_date?: string; product_identifier?: string }>;
    subscriptions?: Record<string, { period_type?: string }>;
  };
}

async function rcSubscriber(uid: string): Promise<RCSub | null> {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
    if (!res.ok) return null;
    return (await res.json()) as RCSub;
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
  retained: boolean;       // active paid AND tenure >= window
  ageDays: number;
  rcCategory: string;
  // Demographics
  country: string;
  plan: string;
  paymentProvider: string;
  gender: string | null;
  hairLossLocation: string | null;
  hairGoal: string | null;
  commitmentAnswer: string | null;
  referralSource: string | null;
  // Behaviors (week 1)
  day1Done: boolean;
  day2Done: boolean;
  day3Done: boolean;
  day7Done: boolean;
  daysCompletedWk1: number;        // 0-7
  daysCompletedTotal: number;      // total days with non-empty progress
  hasStarterPhotos: boolean;
  hasDailyLearning: boolean;
  highestDailyLearningDay: number;
  hasSupportNeeds: boolean;
  supportNeedsCount: number;
}

(async () => {
  const now = Date.now();
  const minPaidAt = new Date(now - COHORT_MAX_DAYS_AGO * 86400000);
  const maxPaidAt = new Date(now - COHORT_MIN_DAYS_AGO * 86400000);

  console.log(`\n=== M${Math.round(RETENTION_WINDOW_DAYS / 30)} Retention Reverse-Engineering ===`);
  console.log(`Cohort: paid_at between ${minPaidAt.toISOString().slice(0, 10)} and ${maxPaidAt.toISOString().slice(0, 10)}`);
  console.log(`Retention defined as: still has active paid entitlement today AND ≥${RETENTION_WINDOW_DAYS} days since paid_at\n`);

  // Pull paid users in the cohort window
  const snap = await db
    .collection("Users")
    .where("paid_at", ">=", minPaidAt)
    .where("paid_at", "<=", maxPaidAt)
    .get();

  const users = snap.docs
    .filter(d => !d.data().is_deleted)
    .map(d => ({ uid: d.id, data: d.data() }));

  console.log(`Paid users in cohort window: ${users.length}`);
  if (users.length < 50) {
    console.log("⚠ Cohort is small — lifts will be noisy. Treat as directional, not statistical.\n");
  }

  // Debug: paid_at distribution
  const ageDaysList = users.map(u => {
    const t = u.data.paid_at?.toDate?.()?.getTime?.() ?? 0;
    return Math.floor((now - t) / 86400000);
  }).sort((a, b) => a - b);
  if (ageDaysList.length > 0) {
    console.log(`paid_at ages: min=${ageDaysList[0]}d, p25=${ageDaysList[Math.floor(ageDaysList.length * 0.25)]}d, p50=${ageDaysList[Math.floor(ageDaysList.length * 0.5)]}d, p75=${ageDaysList[Math.floor(ageDaysList.length * 0.75)]}d, max=${ageDaysList[ageDaysList.length - 1]}d`);
  }

  // Pull RC entitlement state for each
  const enriched: UserAnalysis[] = await batch(users, async (u) => {
    const sub = await rcSubscriber(u.uid);
    const ent = sub?.subscriber?.entitlements?.stoppage_treatment;
    const expires = ent?.expires_date ? new Date(ent.expires_date).getTime() : null;
    const stillActive = expires ? expires > now : false;
    const productId = ent?.product_identifier;
    const periodType = productId ? sub?.subscriber?.subscriptions?.[productId]?.period_type : undefined;

    let rcCategory = "no_entitlement";
    if (ent && stillActive) {
      if (productId?.includes("rc_promo")) rcCategory = "web_promo_grant";
      else if (periodType === "trial") rcCategory = "active_trial";
      else if (periodType === "intro") rcCategory = "active_intro";
      else rcCategory = "active_paid";
    } else if (ent && !stillActive) {
      rcCategory = "expired";
    }

    const paidAt = u.data.paid_at?.toDate?.()?.getTime?.() ?? 0;
    const ageDays = Math.floor((now - paidAt) / 86400000);

    // Behaviors
    const progress = (u.data.progress ?? {}) as Record<string, unknown[]>;
    const dayDone = (n: number) => Array.isArray(progress[`day${n}`]) && progress[`day${n}`].length > 0;

    let daysCompletedTotal = 0;
    for (let d = 1; d <= 90; d++) {
      if (dayDone(d)) daysCompletedTotal++;
    }
    const daysCompletedWk1 = [1, 2, 3, 4, 5, 6, 7].filter(dayDone).length;

    const phone = u.data.phone_number ?? u.data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? "—";

    return {
      uid: u.uid,
      retained: rcCategory === "active_paid" && ageDays >= RETENTION_WINDOW_DAYS,
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
      hasStarterPhotos: !!u.data.starter_photos_submit_submitted_once,
      hasDailyLearning: typeof u.data.daily_learning_completed_day === "number",
      highestDailyLearningDay: (u.data.daily_learning_completed_day as number) ?? 0,
      hasSupportNeeds: Array.isArray(u.data.support_needs) && (u.data.support_needs as unknown[]).length > 0,
      supportNeedsCount: Array.isArray(u.data.support_needs) ? (u.data.support_needs as unknown[]).length : 0,
    };
  }, 40);

  // Distribution
  console.log("\n=== RC category distribution ===");
  const catCounts: Record<string, number> = {};
  for (const r of enriched) catCounts[r.rcCategory] = (catCounts[r.rcCategory] || 0) + 1;
  Object.entries(catCounts).sort((a, b) => b[1] - a[1]).forEach(([k, v]) =>
    console.log(`  ${k.padEnd(22)}: ${v}`)
  );

  const eligibleAtRetentionWindow = enriched.filter(r => r.ageDays >= RETENTION_WINDOW_DAYS);
  const retained = eligibleAtRetentionWindow.filter(r => r.retained);
  const churned = eligibleAtRetentionWindow.filter(r => !r.retained);

  console.log(`\nEligible for M${Math.round(RETENTION_WINDOW_DAYS / 30)} check (paid ≥${RETENTION_WINDOW_DAYS}d ago): ${eligibleAtRetentionWindow.length}`);
  console.log(`  Retained (still active_paid):  ${retained.length} (${pct(retained.length, eligibleAtRetentionWindow.length)}%)`);
  console.log(`  Churned (expired/no ent):      ${churned.length} (${pct(churned.length, eligibleAtRetentionWindow.length)}%)`);
  if (eligibleAtRetentionWindow.length === 0) {
    console.log("\n⚠ No eligible cohort. Try lowering RETENTION_WINDOW_DAYS (e.g., 30 instead of 60).");
    process.exit(0);
  }

  const baseRetention = retained.length / eligibleAtRetentionWindow.length;

  // ─── Lift per binary signal ────────────────────────────────────────────
  console.log(`\n=== Retention lift per behavior signal ===`);
  console.log(`Baseline retention: ${(baseRetention * 100).toFixed(1)}%\n`);
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
    const did = eligibleAtRetentionWindow.filter(sig.pred);
    const didnt = eligibleAtRetentionWindow.filter(u => !sig.pred(u));
    const retDid = did.filter(u => u.retained).length;
    const retDidnt = didnt.filter(u => u.retained).length;
    const pctDid = did.length > 0 ? retDid / did.length : 0;
    const pctDidnt = didnt.length > 0 ? retDidnt / didnt.length : 0;
    const lift = pctDidnt > 0 ? pctDid / pctDidnt : (pctDid > 0 ? Infinity : 0);
    rows.push({
      name: sig.name,
      nDid: did.length, retDid,
      pctDid: pctDid * 100,
      nDidnt: didnt.length, retDidnt,
      pctDidnt: pctDidnt * 100,
      lift,
    });
  }

  rows.sort((a, b) => b.lift - a.lift);
  for (const r of rows) {
    if (r.nDid < 3) continue;  // skip too-small samples
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
  const buckets: Record<number, { total: number; retained: number }> = {};
  for (let i = 0; i <= 7; i++) buckets[i] = { total: 0, retained: 0 };
  for (const u of eligibleAtRetentionWindow) {
    buckets[u.daysCompletedWk1].total++;
    if (u.retained) buckets[u.daysCompletedWk1].retained++;
  }
  for (let i = 0; i <= 7; i++) {
    const b = buckets[i];
    if (b.total === 0) continue;
    const p = pct(b.retained, b.total);
    console.log(`  ${i} days in week 1:  ${String(b.total).padStart(4)} users → ${String(b.retained).padStart(3)} retained (${p}%)`);
  }

  // ─── Output for further analysis ───────────────────────────────────────
  console.log(`\n=== Top 5 retention drivers (with n≥10 sample size) ===`);
  const ranked = rows.filter(r => r.nDid >= 10 && r.lift !== Infinity).sort((a, b) => b.lift - a.lift).slice(0, 5);
  ranked.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(38)} ${r.lift.toFixed(2)}x lift  (${r.pctDid.toFixed(0)}% retained vs ${r.pctDidnt.toFixed(0)}% baseline)`);
  });

  console.log(`\n=== Bottom 5 (anti-signals) ===`);
  const antiRanked = rows.filter(r => r.nDid >= 10 && r.lift !== Infinity).sort((a, b) => a.lift - b.lift).slice(0, 5);
  antiRanked.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(38)} ${r.lift.toFixed(2)}x lift  (${r.pctDid.toFixed(0)}% retained vs ${r.pctDidnt.toFixed(0)}% baseline)`);
  });

  process.exit(0);
})().catch((e) => {
  console.error("ERR:", e);
  process.exit(1);
});

function pct(n: number, d: number): string {
  if (d === 0) return "0";
  return ((n / d) * 100).toFixed(1);
}
