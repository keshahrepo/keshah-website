// Exports the BEST customer cohort (≥30 days completed routine) plus a
// comparison FAILED cohort, with every dimension we have, to a JSON file.
// Multiple agents will analyze this from different angles.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { writeFileSync } from "fs";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";
const DAY_MS = 86400000;

interface RCSub {
  starts_at: number;
  current_period_starts_at: number;
  current_period_ends_at: number;
  ends_at: number;
  status: string;
  store: string;
  product_id?: string | null;
}

interface RCCustomer {
  first_seen_at?: number;
  last_seen_at?: number;
  last_seen_country?: string;
  last_seen_platform?: string;
  active_entitlements?: { items: unknown[] };
}

async function rcCustomer(uid: string) {
  try {
    const [cRes, sRes] = await Promise.all([
      fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}`,
            { headers: { Authorization: `Bearer ${RC_KEY}` } }),
      fetch(`https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
            { headers: { Authorization: `Bearer ${RC_KEY}` } }),
    ]);
    if (!cRes.ok || !sRes.ok) return { customer: null, subs: [] as RCSub[] };
    return {
      customer: (await cRes.json()) as RCCustomer,
      subs: (((await sRes.json()) as { items: RCSub[] }).items ?? []),
    };
  } catch { return { customer: null, subs: [] as RCSub[] }; }
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

  console.log("Pulling all paid users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total: ${candidates.length}\n`);

  console.log("Fetching RC data...");
  const enriched = await batch(candidates, async (d) => ({
    uid: d.id, data: d.data(), rc: await rcCustomer(d.id),
  }), 50);
  process.stderr.write("\n");

  // Build profiles
  const all: Array<Record<string, unknown>> = [];
  for (const r of enriched) {
    if (r.rc.subs.length === 0) continue;

    const earliestStart = Math.min(...r.rc.subs.map(s => s.starts_at));
    const latestEnd = Math.max(...r.rc.subs.map(s => s.ends_at));
    const tenureDays = Math.floor((now - earliestStart) / DAY_MS);
    const totalSubDuration = Math.round((latestEnd - earliestStart) / DAY_MS);
    const hasActiveEnt = (r.rc.customer?.active_entitlements?.items.length ?? 0) > 0;

    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    const completedDays: number[] = [];
    for (const k of Object.keys(progress)) {
      if (!k.startsWith("day")) continue;
      const n = parseInt(k.slice(3), 10);
      if (!Number.isFinite(n)) continue;
      if (Array.isArray(progress[k]) && progress[k].length > 0) completedDays.push(n);
    }
    const totalDaysCompleted = completedDays.length;
    const maxDay = totalDaysCompleted > 0 ? Math.max(...completedDays) : 0;
    const wk1Days = completedDays.filter(d => d <= 7).length;
    const wk2Days = completedDays.filter(d => d >= 8 && d <= 14).length;
    const wk34Days = completedDays.filter(d => d >= 15 && d <= 30).length;
    const consistencyRate = tenureDays > 0 ? totalDaysCompleted / tenureDays : 0;

    const phone = r.data.phone_number ?? r.data.phone;
    const country = (phone as { country_code?: string })?.country_code ?? r.rc.customer?.last_seen_country ?? null;
    const latestSub = r.rc.subs.sort((a, b) => b.starts_at - a.starts_at)[0];

    const profile = {
      uid: r.uid,
      // RC + tenure
      tenureDays,
      totalSubDuration,
      hasActiveEnt,
      store: latestSub?.store ?? null,
      productId: latestSub?.product_id ?? null,
      country,
      platform: r.rc.customer?.last_seen_platform ?? null,
      // Behavior
      totalDaysCompleted,
      maxDay,
      wk1Days,
      wk2Days,
      wk34Days,
      consistencyRate: Number(consistencyRate.toFixed(3)),
      // Demographics
      gender: r.data.selected_gender ?? null,
      hairLossLocation: r.data.hair_loss_location ?? null,
      hairGoal: r.data.hair_goal ?? null,
      commitmentAnswer: r.data.commitment_answer ?? null,
      // Source
      signupSource: r.data.signup_source ?? null,
      referralSource: r.data.referral_source ?? null,
      plan: r.data.plan ?? null,
      paymentProvider: r.data.payment_provider ?? null,
      // Quiz
      supportNeeds: Array.isArray(r.data.support_needs) ? r.data.support_needs as string[] : [],
      treatmentsTried: Array.isArray(r.data.treatments_tried) ? r.data.treatments_tried as string[] : [],
      // Daily learning
      dailyLearningDay: r.data.daily_learning_completed_day ?? 0,
    };
    all.push(profile);
  }

  console.log(`Profiles built: ${all.length}`);

  // Define cohorts
  const best = all.filter(p => (p.totalDaysCompleted as number) >= 30);
  const failed = all.filter(p => {
    const t = p.totalDaysCompleted as number;
    const tenure = p.tenureDays as number;
    return t < 10 && tenure >= 30 && !p.hasActiveEnt;
  });

  console.log(`BEST   (≥30 days completed):                ${best.length}`);
  console.log(`FAILED (<10 days, ≥30d tenure, expired):    ${failed.length}\n`);

  const output = { generated_at: new Date().toISOString(), best, failed, all };
  writeFileSync(
    "/tmp/best_customer_cohort.json",
    JSON.stringify(output, null, 2),
  );
  console.log(`Written: /tmp/best_customer_cohort.json (${best.length} BEST, ${failed.length} FAILED)`);

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
