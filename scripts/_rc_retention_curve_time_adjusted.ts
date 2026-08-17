// Time-adjusted retention curve for RC-validated paid users.
// At each day milestone X, the denominator is ONLY users who have had X+
// days of opportunity since their first paid event (RC subscription starts_at).

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

interface Sub {
  starts_at: number;
  store?: string;
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
      if (done % 1000 === 0) process.stderr.write(`  ${done}/${items.length}\r`);
    }
  }));
  return out;
}

(async () => {
  const now = Date.now();

  console.log("Pulling all paidStoppage-tagged users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Candidates: ${candidates.length}`);

  console.log("Validating against RC...");
  const results = await batch(candidates, async (d) => {
    const subs = await rcSubs(d.id);
    return { uid: d.id, data: d.data(), subs };
  }, 50);
  process.stderr.write("\n");

  // Build paid user records with tenure + max routine day
  const paid: Array<{ tenureDays: number; maxDay: number; store: string }> = [];
  for (const r of results) {
    if (r.subs.length === 0) continue;
    const earliestStart = Math.min(...r.subs.map(s => s.starts_at));
    const tenureDays = Math.floor((now - earliestStart) / DAY_MS);
    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    let maxDay = 0;
    for (const k of Object.keys(progress)) {
      if (!k.startsWith("day")) continue;
      const n = parseInt(k.slice(3), 10);
      if (!Number.isFinite(n)) continue;
      if (Array.isArray(progress[k]) && progress[k].length > 0 && n > maxDay) maxDay = n;
    }
    const store = r.subs[0]?.store ?? "unknown";
    paid.push({ tenureDays, maxDay, store });
  }

  console.log(`RC-validated paid users: ${paid.length}\n`);

  // Tenure distribution
  console.log("Tenure distribution (days since first RC subscription):");
  const tenureBuckets: Record<string, number> = {};
  for (const p of paid) {
    const k = p.tenureDays < 7 ? "0-6d" : p.tenureDays < 14 ? "7-13d" : p.tenureDays < 30 ? "14-29d" : p.tenureDays < 60 ? "30-59d" : p.tenureDays < 90 ? "60-89d" : p.tenureDays < 180 ? "90-179d" : "180+d";
    tenureBuckets[k] = (tenureBuckets[k] || 0) + 1;
  }
  for (const [k, v] of Object.entries(tenureBuckets)) {
    console.log(`  ${k.padEnd(10)} ${v}`);
  }
  console.log("");

  // Time-adjusted curve
  console.log("=== Time-adjusted retention curve ===");
  console.log("(at each milestone, denominator = only users with tenure ≥ that milestone)\n");
  console.log("Day   Eligible    Reached    Retention %");
  console.log("─".repeat(50));
  const milestones = [1, 3, 5, 7, 10, 14, 21, 30, 45, 60, 75, 90, 120];
  for (const m of milestones) {
    const eligible = paid.filter(p => p.tenureDays >= m);
    const reached = eligible.filter(p => p.maxDay >= m);
    const pct = eligible.length > 0 ? (reached.length / eligible.length) * 100 : 0;
    console.log(
      `Day ${String(m).padStart(3)}: ${String(eligible.length).padStart(8)}    ${String(reached.length).padStart(7)}    ${pct.toFixed(1).padStart(6)}%`,
    );
  }

  // By store, time-adjusted
  console.log("\n=== Time-adjusted retention by store ===");
  const stores = [...new Set(paid.map(p => p.store))];
  for (const store of stores) {
    const cohort = paid.filter(p => p.store === store);
    if (cohort.length < 10) continue;
    console.log(`\n${store} (n=${cohort.length}):`);
    console.log("Day   Eligible    Reached    Retention %");
    for (const m of [1, 7, 14, 30, 60]) {
      const eligible = cohort.filter(p => p.tenureDays >= m);
      const reached = eligible.filter(p => p.maxDay >= m);
      const pct = eligible.length > 0 ? (reached.length / eligible.length) * 100 : 0;
      console.log(
        `Day ${String(m).padStart(3)}: ${String(eligible.length).padStart(8)}    ${String(reached.length).padStart(7)}    ${pct.toFixed(1).padStart(6)}%`,
      );
    }
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
