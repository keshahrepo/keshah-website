// Retention curve for RC-validated paid users only.
// "Paid" = has at least one RC subscription record (via V2 API).
// Cohort: every Firestore user with paidStoppage tag, validated against RC.

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
  ends_at: number;
  status: string;
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
  console.log("Pulling all paidStoppage-tagged users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Candidates: ${candidates.length}`);

  console.log("Validating against RC (concurrency 50)...");
  const results = await batch(candidates, async (d) => {
    const subs = await rcSubs(d.id);
    return { uid: d.id, data: d.data(), subs };
  }, 50);
  process.stderr.write("\n");

  // Keep only RC-validated paid users
  const paid = results.filter(r => r.subs.length > 0);
  console.log(`RC-validated paid users: ${paid.length}\n`);

  // Compute max routine day for each
  const dayCounts: Record<number, number> = {};
  for (const r of paid) {
    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    let maxDay = 0;
    for (const k of Object.keys(progress)) {
      if (!k.startsWith("day")) continue;
      const n = parseInt(k.slice(3), 10);
      if (!Number.isFinite(n)) continue;
      if (Array.isArray(progress[k]) && progress[k].length > 0 && n > maxDay) {
        maxDay = n;
      }
    }
    dayCounts[maxDay] = (dayCounts[maxDay] || 0) + 1;
  }

  // Build curve: % of paid users who reached day X
  console.log("=== Retention curve (RC-validated paid users) ===");
  console.log(`Total paid: ${paid.length}\n`);
  console.log("Day reached     #         % cumulative");
  console.log("─".repeat(50));
  const milestones = [0, 1, 3, 5, 7, 10, 14, 21, 30, 45, 60, 75, 90, 120];
  for (const m of milestones) {
    let reached = 0;
    for (const [maxDay, count] of Object.entries(dayCounts)) {
      if (parseInt(maxDay) >= m) reached += count;
    }
    const pct = ((reached / paid.length) * 100).toFixed(1);
    console.log(`Day ${String(m).padStart(3)}:         ${String(reached).padStart(5)}     ${pct.padStart(5)}%`);
  }

  // Also segment by store (iOS / Android / promotional)
  console.log("\n=== By store ===");
  const byStore: Record<string, { total: number; reached: Record<number, number> }> = {};
  for (const r of paid) {
    const store = (r.subs[0] as Sub & { store?: string }).store || "unknown";
    if (!byStore[store]) byStore[store] = { total: 0, reached: {} };
    byStore[store].total++;
    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    let maxDay = 0;
    for (const k of Object.keys(progress)) {
      if (!k.startsWith("day")) continue;
      const n = parseInt(k.slice(3), 10);
      if (!Number.isFinite(n)) continue;
      if (Array.isArray(progress[k]) && progress[k].length > 0 && n > maxDay) maxDay = n;
    }
    for (const m of milestones) {
      if (maxDay >= m) byStore[store].reached[m] = (byStore[store].reached[m] || 0) + 1;
    }
  }
  for (const [store, d] of Object.entries(byStore)) {
    console.log(`\n${store} (n=${d.total}):`);
    for (const m of [1, 7, 14, 30, 60]) {
      const r = d.reached[m] || 0;
      console.log(`  Day ${m}: ${r} (${((r/d.total)*100).toFixed(1)}%)`);
    }
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
