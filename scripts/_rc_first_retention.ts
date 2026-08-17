// RC-first retention analysis. Iterates ALL RC customers, filters to those
// with subscriptions, cross-references with Firestore for progress data.
// Goal: match the 1,336 active subscription count from RC dashboard.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";
const DAY_MS = 86400000;

interface Customer {
  id: string;
  first_seen_at: number;
}

interface Sub {
  starts_at: number;
  current_period_starts_at: number;
  current_period_ends_at: number;
  ends_at: number;
  status: string;
  store: string;
  product_id?: string | null;
}

async function listAllCustomers(): Promise<Customer[]> {
  const all: Customer[] = [];
  let nextPage: string | null = null;
  let page = 0;
  do {
    const url = nextPage
      ? (nextPage.startsWith("http") ? nextPage : `https://api.revenuecat.com${nextPage}`)
      : `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers?limit=100`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${RC_KEY}` } });
    if (!res.ok) throw new Error(`Customer list failed: ${res.status}`);
    const data = (await res.json()) as { items: Customer[]; next_page: string | null };
    all.push(...data.items);
    nextPage = data.next_page;
    page++;
    if (page % 10 === 0) process.stderr.write(`  page ${page} (${all.length} customers)\r`);
  } while (nextPage);
  process.stderr.write("\n");
  return all;
}

async function getSubs(uid: string): Promise<Sub[]> {
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
      if (done % 1000 === 0) process.stderr.write(`  ${done}/${items.length}\r`);
    }
  }));
  process.stderr.write("\n");
  return out;
}

(async () => {
  const now = Date.now();
  const SINCE = new Date("2026-02-01T00:00:00Z").getTime();

  console.log("Step 1: Listing all RC customers (paginated)...");
  const all = await listAllCustomers();
  console.log(`Total RC customers (all time): ${all.length}`);

  // Filter to first_seen_at >= Feb 1 2026 (paid stoppage launch cohort)
  const customers = all.filter(c => (c.first_seen_at ?? 0) >= SINCE);
  console.log(`Filtered to first_seen_at >= 2026-02-01: ${customers.length}\n`);

  console.log("Step 2: Fetching subscriptions for filtered customers (concurrency 50)...");
  const enriched = await batch(customers, async (c) => ({
    id: c.id,
    first_seen_at: c.first_seen_at,
    subs: await getSubs(c.id),
  }), 50);

  // Filter to customers with at least one subscription record
  const withSubs = enriched.filter(e => e.subs.length > 0);
  // Active = has subscription where ends_at > now AND status === active
  const active = withSubs.filter(e => e.subs.some(s => s.ends_at > now && s.status === "active"));

  console.log(`Customers with any subscription:   ${withSubs.length}`);
  console.log(`Customers with ACTIVE subscription: ${active.length}`);
  console.log("");

  // Filter to native (non-promotional) for clean retention math
  const nativeActive = active.filter(e => e.subs.some(s => s.store !== "promotional"));
  const promoActive = active.filter(e => e.subs.every(s => s.store === "promotional"));
  console.log(`  Native (iOS/Android): ${nativeActive.length}`);
  console.log(`  Promotional only:      ${promoActive.length}`);
  console.log("");

  // Step 3: Cross-reference Firestore for progress data
  // USE FULL COHORT (withSubs = 618) — includes both active and churned
  // for the true cohort retention curve.
  console.log("Step 3: Cross-referencing with Firestore (concurrency 50)...");
  const enrichedWithFs = await batch(withSubs, async (e) => {
    try {
      const doc = await db.collection("Users").doc(e.id).get();
      if (!doc.exists) return { ...e, fsExists: false, maxDay: 0, totalDays: 0 };
      const data = doc.data() ?? {};
      if (data.is_deleted) return { ...e, fsExists: false, maxDay: 0, totalDays: 0 };
      const progress = (data.progress ?? {}) as Record<string, unknown[]>;
      let maxDay = 0;
      let totalDays = 0;
      for (const k of Object.keys(progress)) {
        if (!k.startsWith("day")) continue;
        const n = parseInt(k.slice(3), 10);
        if (!Number.isFinite(n)) continue;
        if (Array.isArray(progress[k]) && progress[k].length > 0) {
          totalDays++;
          if (n > maxDay) maxDay = n;
        }
      }
      return { ...e, fsExists: true, maxDay, totalDays };
    } catch {
      return { ...e, fsExists: false, maxDay: 0, totalDays: 0 };
    }
  }, 50);

  const withFs = enrichedWithFs.filter(e => e.fsExists);
  console.log(`Active RC customers with Firestore doc: ${withFs.length}/${active.length}\n`);

  // Compute time-adjusted retention curve
  // Tenure = days since earliest subscription start
  const records = withFs.map(e => {
    const earliestStart = Math.min(...e.subs.map(s => s.starts_at));
    const tenureDays = Math.floor((now - earliestStart) / DAY_MS);
    const isPromoOnly = e.subs.every(s => s.store === "promotional");
    return {
      id: e.id,
      tenureDays,
      maxDay: e.maxDay,
      totalDays: e.totalDays,
      isPromoOnly,
      store: e.subs.find(s => s.store !== "promotional")?.store ?? "promotional",
    };
  });

  // Native only retention
  const native = records.filter(r => !r.isPromoOnly);

  console.log(`=== Time-adjusted retention (NATIVE active subscribers, n=${native.length}) ===`);
  console.log("Day    Eligible    Reached    Retention %");
  console.log("─".repeat(50));
  for (const m of [1, 3, 5, 7, 10, 14, 21, 30, 45, 60, 75, 90]) {
    const elig = native.filter(r => r.tenureDays >= m);
    const reached = elig.filter(r => r.maxDay >= m);
    const pct = elig.length > 0 ? (reached.length / elig.length) * 100 : 0;
    console.log(
      `Day ${String(m).padStart(3)}: ${String(elig.length).padStart(8)}    ${String(reached.length).padStart(7)}    ${pct.toFixed(1).padStart(6)}%`,
    );
  }

  // By store
  console.log("\n=== By store ===");
  for (const store of ["app_store", "play_store"]) {
    const cohort = native.filter(r => r.store === store);
    if (cohort.length < 10) continue;
    console.log(`\n${store} (n=${cohort.length}):`);
    for (const m of [1, 7, 14, 30, 60]) {
      const elig = cohort.filter(r => r.tenureDays >= m);
      const reached = elig.filter(r => r.maxDay >= m);
      const pct = elig.length > 0 ? (reached.length / elig.length) * 100 : 0;
      console.log(`  Day ${String(m).padStart(3)}: ${String(reached.length)}/${String(elig.length)} = ${pct.toFixed(1)}%`);
    }
  }

  // Tenure distribution
  console.log("\n=== Tenure distribution (native only) ===");
  const buckets: Record<string, number> = {};
  for (const r of native) {
    const k = r.tenureDays < 7 ? "0-6d" : r.tenureDays < 14 ? "7-13d" : r.tenureDays < 30 ? "14-29d" : r.tenureDays < 60 ? "30-59d" : r.tenureDays < 90 ? "60-89d" : r.tenureDays < 180 ? "90-179d" : "180+d";
    buckets[k] = (buckets[k] || 0) + 1;
  }
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
