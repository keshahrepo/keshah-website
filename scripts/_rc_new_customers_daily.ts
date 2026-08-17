// Daily new paying customers from RC.
// "New customer" = first-ever subscription starts on that day (RC subs.original_purchase_date).
// Cross-checks all Firestore users flagged as paid (pro==true OR any paid* tag) against RC.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";

const LOOKBACK_DAYS = parseInt(process.argv[2] ?? "60", 10);
const SPLIT = process.argv[3];  // optional: YYYY-MM-DD

async function rcSubs(uid: string) {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { items: any[] };
    return data.items ?? [];
  } catch { return []; }
}

async function batch<T, R>(items: T[], fn: (x: T) => Promise<R>, concurrency = 40): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      out[idx] = await fn(items[idx]);
      done++;
      if (done % 100 === 0) process.stderr.write(`  ${done}/${items.length}\r`);
    }
  }));
  return out;
}

function dayKey(d: Date): string {
  const edt = new Date(d.getTime() - 4 * 3600_000);
  return edt.toISOString().split("T")[0];
}

function stats(xs: number[]) {
  const n = xs.length;
  if (!n) return { n, mean: 0, stddev: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const v = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  return { n, mean, stddev: Math.sqrt(v) };
}

(async () => {
  console.log("Pulling candidate paid users from Firestore…");
  // Union: pro==true OR any paid* extra_user_tag
  const [proSnap, paidStopSnap, paidRgSnap] = await Promise.all([
    db.collection("Users").where("pro", "==", true).get(),
    db.collection("Users").where("extra_user_tags", "array-contains", "paidStoppage").get(),
    db.collection("Users").where("extra_user_tags", "array-contains", "paidRegrowth").get(),
  ]);
  const uids = new Set<string>();
  for (const d of proSnap.docs) uids.add(d.id);
  for (const d of paidStopSnap.docs) uids.add(d.id);
  for (const d of paidRgSnap.docs) uids.add(d.id);
  const uidList = [...uids];
  console.log(`  pro==true: ${proSnap.size}  |  paidStoppage: ${paidStopSnap.size}  |  paidRegrowth: ${paidRgSnap.size}`);
  console.log(`  union: ${uidList.length}\n`);

  console.log(`Querying RC subscriptions (concurrency=40)…`);
  const results = await batch(uidList, async (uid) => ({ uid, subs: await rcSubs(uid) }));
  process.stderr.write("\n");

  // First-purchase per user
  const firstPurchases: { uid: string; ts: Date }[] = [];
  for (const r of results) {
    if (!r.subs.length) continue;
    let earliest: number | null = null;
    for (const s of r.subs) {
      // v2 subs return timestamps as ms since epoch OR ISO — coerce.
      const raw = s.starts_at ?? s.original_purchase_date_ms ?? s.purchase_date ?? null;
      if (raw == null) continue;
      const ts = typeof raw === "number" ? raw : new Date(raw).getTime();
      if (!Number.isFinite(ts)) continue;
      if (earliest === null || ts < earliest) earliest = ts;
    }
    if (earliest !== null) firstPurchases.push({ uid: r.uid, ts: new Date(earliest) });
  }
  console.log(`RC-confirmed paying customers total: ${firstPurchases.length}\n`);

  // Bucket by day (EDT), last LOOKBACK_DAYS
  const daily: Record<string, number> = {};
  const cutoff = Date.now() - LOOKBACK_DAYS * 86400_000;
  for (const fp of firstPurchases) {
    if (fp.ts.getTime() < cutoff) continue;
    const k = dayKey(fp.ts);
    daily[k] = (daily[k] ?? 0) + 1;
  }

  // Fill missing days with 0
  const series: { date: string; n: number }[] = [];
  for (let i = LOOKBACK_DAYS - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000);
    const k = dayKey(d);
    series.push({ date: k, n: daily[k] ?? 0 });
  }

  console.log("Daily new paying customers (EDT):\n");
  const today = dayKey(new Date());
  for (const s of series) {
    const bar = "█".repeat(s.n);
    const marker = s.date === today ? " ← TODAY (partial)" : "";
    console.log(`  ${s.date}  ${s.n.toString().padStart(4)}  ${bar}${marker}`);
  }

  const counts = series.map(s => s.n);
  const st = stats(counts);
  console.log(`\n60-day mean: ${st.mean.toFixed(1)}/day   stddev: ${st.stddev.toFixed(1)}   CV: ${(st.stddev / (st.mean || 1)).toFixed(2)}`);

  if (SPLIT) {
    const splitDate = SPLIT;
    const idx = series.findIndex(s => s.date >= splitDate);
    if (idx > 3 && idx < series.length - 1) {
      const pre = counts.slice(0, idx);
      const post = counts.slice(idx, counts.length - 1);  // exclude today's partial
      const preS = stats(pre);
      const postS = stats(post);
      const lift = preS.mean === 0 ? 0 : (postS.mean - preS.mean) / preS.mean;
      const se = Math.sqrt(preS.stddev ** 2 / preS.n + postS.stddev ** 2 / postS.n);
      const z = se === 0 ? 0 : (postS.mean - preS.mean) / se;
      console.log(`\nSPLIT @ ${splitDate}:`);
      console.log(`  pre  (${preS.n}d):  ${preS.mean.toFixed(1)}/day ± ${preS.stddev.toFixed(1)}`);
      console.log(`  post (${postS.n}d): ${postS.mean.toFixed(1)}/day ± ${postS.stddev.toFixed(1)}`);
      console.log(`  observed lift: ${(lift * 100).toFixed(1)}%   z=${z.toFixed(2)}  ${Math.abs(z) >= 1.96 ? "SIGNIFICANT" : "within noise"}`);
    }
  }

  // MDE at real variance
  console.log(`\nMDE (days needed at 95% conf, 80% power):`);
  for (const lift of [0.10, 0.20, 0.30, 0.50, 1.0, 2.0]) {
    if (st.mean === 0) { console.log(`  ${(lift * 100).toString().padStart(4)}% lift  → mean is 0, cannot compute`); continue; }
    const delta = st.mean * lift;
    const days = Math.ceil((2.8 ** 2 * 2 * st.stddev ** 2) / (delta ** 2));
    const flag = days <= 14 ? "✓" : days <= 60 ? "○" : "✗";
    console.log(`  ${flag}  ${(lift * 100).toString().padStart(4)}% lift  →  ${days} days`);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
