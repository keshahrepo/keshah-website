// Best customer signature analysis.
//
// Definition:
//   BEST    = RC subscription tenure ≥ 60d AND progress.day14 exists
//   FAILED  = RC sub 30-89d, expired, didn't renew (failed at M1 boundary)
//
// Compares the two groups on stable, immutable dimensions only.
// Ranks signals by lift. Surfaces the customer signature.

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
  product_id?: string | null;
}

interface Customer {
  last_seen_country?: string;
  last_seen_platform?: string;
  active_entitlements?: { items: unknown[] };
}

async function rcCustomer(uid: string): Promise<{ customer: Customer | null; subs: Sub[] }> {
  try {
    const [cRes, sRes] = await Promise.all([
      fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}`,
            { headers: { Authorization: `Bearer ${RC_KEY}` } }),
      fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
            { headers: { Authorization: `Bearer ${RC_KEY}` } }),
    ]);
    if (!cRes.ok || !sRes.ok) return { customer: null, subs: [] };
    return {
      customer: (await cRes.json()) as Customer,
      subs: ((await sRes.json()) as { items: Sub[] }).items ?? [],
    };
  } catch { return { customer: null, subs: [] }; }
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

interface Profile {
  uid: string;
  tenureDays: number;
  hasActiveEnt: boolean;
  store: string;
  productId: string;
  country: string;
  platform: string;
  gender: string;
  hairLossLocation: string;
  hairGoal: string;
  commitmentAnswer: string;
  supportNeeds: string[];
  reachedDay7: boolean;
  reachedDay14: boolean;
  reachedDay30: boolean;
}

(async () => {
  const now = Date.now();
  console.log("Pulling paid users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total: ${candidates.length}`);

  console.log("Fetching RC data (concurrency 50)...");
  const results = await batch(candidates, async (d) => ({
    uid: d.id, data: d.data(), rc: await rcCustomer(d.id),
  }), 50);
  process.stderr.write("\n");

  // Build profile per user
  const profiles: Profile[] = [];
  for (const r of results) {
    const subs = r.rc.subs;
    if (subs.length === 0) continue;
    // Use earliest start across any subscription as cohort timestamp
    const earliestStart = Math.min(...subs.map(s => s.starts_at));
    const latestEnd = Math.max(...subs.map(s => s.ends_at));
    const tenureDays = Math.round((latestEnd - earliestStart) / DAY_MS);
    const hasActiveEnt = (r.rc.customer?.active_entitlements?.items.length ?? 0) > 0;
    const latestSub = subs.sort((a, b) => b.starts_at - a.starts_at)[0];

    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    const dayDone = (n: number) => Array.isArray(progress[`day${n}`]) && progress[`day${n}`].length > 0;

    const phone = r.data.phone_number ?? r.data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? r.rc.customer?.last_seen_country ?? "—";

    profiles.push({
      uid: r.uid,
      tenureDays,
      hasActiveEnt,
      store: latestSub?.store ?? "—",
      productId: latestSub?.product_id ?? "—",
      country,
      platform: r.rc.customer?.last_seen_platform ?? "—",
      gender: (r.data.selected_gender as string) ?? "—",
      hairLossLocation: (r.data.hair_loss_location as string) ?? "—",
      hairGoal: (r.data.hair_goal as string) ?? "—",
      commitmentAnswer: (r.data.commitment_answer as string) ?? "—",
      supportNeeds: Array.isArray(r.data.support_needs) ? r.data.support_needs as string[] : [],
      reachedDay7: dayDone(7),
      reachedDay14: dayDone(14),
      reachedDay30: dayDone(30),
    });
  }
  console.log(`Profiles built: ${profiles.length}`);

  // BEST: tenure ≥ 60d AND reached day 14 of routine
  const best = profiles.filter(p => p.tenureDays >= 60 && p.reachedDay14);
  // FAILED: tenure 30-89d, NOT active anymore (real failure at M1)
  const failed = profiles.filter(p => p.tenureDays >= 30 && p.tenureDays < 90 && !p.hasActiveEnt);

  console.log(`\n=== Cohort sizes ===`);
  console.log(`BEST   (tenure≥60d AND reached day 14):       ${best.length}`);
  console.log(`FAILED (tenure 30-89d, expired, didn't renew): ${failed.length}`);

  if (best.length < 10 || failed.length < 10) {
    console.log("\n⚠ Cohort too small for a clean signature. Lifts will be very noisy.");
  }

  console.log(`\n═══ BEST CUSTOMER SIGNATURE ═══`);
  console.log(`(comparing BEST vs FAILED — what's different about the winners)\n`);
  console.log(
    "Dimension".padEnd(40),
    "BEST %".padStart(10),
    "FAILED %".padStart(10),
    "Lift".padStart(8),
    "Read".padStart(20),
  );
  console.log("─".repeat(95));

  type Sig = { name: string; pred: (p: Profile) => boolean };
  const signals: Sig[] = [
    // Loss location
    { name: "loss_location = all_over",     pred: p => p.hairLossLocation === "all_over" },
    { name: "loss_location = crown",        pred: p => p.hairLossLocation === "crown" },
    { name: "loss_location = hairline",     pred: p => p.hairLossLocation === "hairline" },
    // Goal
    { name: "hair_goal = both",             pred: p => p.hairGoal === "both" },
    { name: "hair_goal = stop_the_loss",    pred: p => p.hairGoal === "stop_the_loss" },
    { name: "hair_goal = regrow_hair",      pred: p => p.hairGoal === "regrow_hair" },
    // Gender
    { name: "gender = male",                pred: p => p.gender === "male" },
    { name: "gender = female",              pred: p => p.gender === "female" },
    // Country
    { name: "country = IN",                 pred: p => p.country === "IN" },
    { name: "country = US",                 pred: p => p.country === "US" },
    // Store / platform
    { name: "store = app_store (iOS)",      pred: p => p.store === "app_store" },
    { name: "store = play_store (Android)", pred: p => p.store === "play_store" },
    { name: "store = promotional (web)",    pred: p => p.store === "promotional" },
    { name: "platform = ios",               pred: p => p.platform === "ios" },
    { name: "platform = android",           pred: p => p.platform === "android" },
    // Support needs categories
    { name: "selected ≥1 support need",     pred: p => p.supportNeeds.length >= 1 },
    { name: "selected ≥3 support needs",    pred: p => p.supportNeeds.length >= 3 },
    { name: "selected dht_hormones",        pred: p => p.supportNeeds.includes("dht_hormones") },
    { name: "selected fix_dandruff",        pred: p => p.supportNeeds.includes("fix_dandruff") },
    { name: "selected get_off_medication",  pred: p => p.supportNeeds.includes("get_off_medication") },
    { name: "selected stress",              pred: p => p.supportNeeds.includes("stress") },
    { name: "selected diet",                pred: p => p.supportNeeds.includes("diet") },
    { name: "selected bloodwork_vitamins",  pred: p => p.supportNeeds.includes("bloodwork_vitamins") },
    // Commitment
    { name: "commitment_answer = yes",      pred: p => p.commitmentAnswer === "yes" },
  ];

  type Row = { name: string; bestPct: number; failedPct: number; lift: number; bestN: number; failedN: number };
  const rows: Row[] = [];
  for (const s of signals) {
    const bestN = best.filter(s.pred).length;
    const failedN = failed.filter(s.pred).length;
    const bestPct = best.length > 0 ? bestN / best.length : 0;
    const failedPct = failed.length > 0 ? failedN / failed.length : 0;
    const lift = failedPct > 0 ? bestPct / failedPct : (bestPct > 0 ? Infinity : 0);
    rows.push({ name: s.name, bestPct: bestPct * 100, failedPct: failedPct * 100, lift, bestN, failedN });
  }

  // Sort by lift descending
  rows.sort((a, b) => b.lift - a.lift);
  for (const r of rows) {
    let read = "";
    if (r.bestN < 3 || r.failedN < 3) read = "(too few)";
    else if (r.lift >= 1.5) read = "WINNER signal";
    else if (r.lift <= 0.66) read = "AVOID signal";
    else read = "neutral";
    console.log(
      r.name.padEnd(40),
      `${r.bestPct.toFixed(0)}% (${r.bestN})`.padStart(10),
      `${r.failedPct.toFixed(0)}% (${r.failedN})`.padStart(10),
      `${r.lift === Infinity ? "∞" : r.lift.toFixed(2)}x`.padStart(8),
      read.padStart(20),
    );
  }

  // ─── The signature ─────────────────────────────────────────────
  console.log(`\n═══ TOP 5 WINNER signals (n≥5 in both cohorts) ═══`);
  const winners = rows.filter(r => r.bestN >= 5 && r.failedN >= 5 && r.lift !== Infinity).sort((a, b) => b.lift - a.lift).slice(0, 5);
  winners.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(38)} ${r.lift.toFixed(2)}x lift  (${r.bestPct.toFixed(0)}% of BEST vs ${r.failedPct.toFixed(0)}% of FAILED)`);
  });

  console.log(`\n═══ TOP 5 AVOID signals (over-indexed in FAILED) ═══`);
  const avoid = rows.filter(r => r.bestN >= 5 && r.failedN >= 5 && r.lift !== Infinity).sort((a, b) => a.lift - b.lift).slice(0, 5);
  avoid.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.name.padEnd(38)} ${r.lift.toFixed(2)}x lift  (${r.bestPct.toFixed(0)}% of BEST vs ${r.failedPct.toFixed(0)}% of FAILED)`);
  });

  // BEST customer signature in plain English
  console.log(`\n═══ THE BEST CUSTOMER SIGNATURE ═══`);
  const sigParts: string[] = [];
  for (const r of winners.slice(0, 3)) {
    sigParts.push(`${r.name} (${r.lift.toFixed(1)}x more likely)`);
  }
  console.log(`Most likely characteristics:`);
  for (const p of sigParts) console.log(`  ✓ ${p}`);

  console.log(`\nLeast likely (avoid these in targeting):`);
  for (const r of avoid.slice(0, 3)) {
    console.log(`  ✗ ${r.name} (${r.lift.toFixed(2)}x — under-indexes)`);
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
