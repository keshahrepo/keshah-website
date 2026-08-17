// Verification script: dump actual UIDs + raw values from the M1 renewer
// vs churner cohorts so the user can spot-check in Firestore/RC console.
//
// No interpretation. Just raw data.

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
  product_id?: string | null;
}

async function rcSubs(uid: string): Promise<Sub[]> {
  const res = await fetch(
    `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`,
    { headers: { Authorization: `Bearer ${RC_KEY}` } }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { items: Sub[] };
  return data.items ?? [];
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

(async () => {
  const now = Date.now();
  console.log("Pulling paid users from Firestore...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total paid-tagged in Firestore: ${candidates.length}`);

  console.log("Fetching RC subs...");
  const results = await batch(candidates, async (d) => ({
    uid: d.id, data: d.data(), subs: await rcSubs(d.id),
  }), 50);
  process.stderr.write("\n");

  // Apply same logic as deep-dive
  type Row = {
    uid: string; ageDays: number; renewed: boolean; subCount: number;
    earliestStart: number; latestEnd: number; periodDays: number; productId: string;
    daysCompleted: number[]; maxDay: number; supportNeeds: string[];
    hairLossLocation: string; daily_learning_completed_day: number;
  };
  const renewers: Row[] = [];
  const churners: Row[] = [];

  for (const r of results) {
    if (r.subs.length === 0) continue;
    const monthly = r.subs.filter(s => {
      const days = Math.round((s.current_period_ends_at - s.current_period_starts_at) / DAY_MS);
      return days >= 28 && days <= 32;
    });
    if (monthly.length === 0) continue;
    const earliestStart = Math.min(...monthly.map(s => s.starts_at));
    const latestEnd = Math.max(...monthly.map(s => s.ends_at));
    const ageDays = Math.floor((now - earliestStart) / DAY_MS);
    if (ageDays < 35) continue;
    const totalDur = Math.round((latestEnd - earliestStart) / DAY_MS);
    const renewed = monthly.some(s => s.current_period_starts_at > s.starts_at) || totalDur > 35 || monthly.length > 1;
    const periodDays = Math.round((monthly[0].current_period_ends_at - monthly[0].current_period_starts_at) / DAY_MS);

    const progress = (r.data.progress ?? {}) as Record<string, unknown[]>;
    const daysCompleted: number[] = [];
    for (let d = 1; d <= 90; d++) {
      if (Array.isArray(progress[`day${d}`]) && progress[`day${d}`].length > 0) daysCompleted.push(d);
    }

    const row: Row = {
      uid: r.uid,
      ageDays,
      renewed,
      subCount: monthly.length,
      earliestStart,
      latestEnd,
      periodDays,
      productId: monthly[0].product_id ?? "—",
      daysCompleted,
      maxDay: daysCompleted.length > 0 ? Math.max(...daysCompleted) : 0,
      supportNeeds: Array.isArray(r.data.support_needs) ? r.data.support_needs as string[] : [],
      hairLossLocation: (r.data.hair_loss_location as string) ?? "—",
      daily_learning_completed_day: (r.data.daily_learning_completed_day as number) ?? 0,
    };
    if (renewed) renewers.push(row);
    else churners.push(row);
  }

  console.log(`\n=== Cohort sizes ===`);
  console.log(`Renewers: ${renewers.length}`);
  console.log(`Churners: ${churners.length}`);

  // Sample 5 of each — print detailed
  console.log(`\n═══ 5 SAMPLE RENEWERS — verify in console.firebase.google.com ═══`);
  for (const r of renewers.slice(0, 5)) {
    console.log(`\nUID: ${r.uid}`);
    console.log(`  RC age: ${r.ageDays}d   sub period: ${r.periodDays}d   sub count: ${r.subCount}`);
    console.log(`  starts_at: ${new Date(r.earliestStart).toISOString()}`);
    console.log(`  latestEnd: ${new Date(r.latestEnd).toISOString()}`);
    console.log(`  total_duration_days: ${Math.round((r.latestEnd - r.earliestStart) / DAY_MS)}`);
    console.log(`  product_id: ${r.productId}`);
    console.log(`  RENEWED REASON: ${r.subCount > 1 ? "multiple subs" : Math.round((r.latestEnd - r.earliestStart) / DAY_MS) > 35 ? "duration > 35d" : "current_period_starts > starts"}`);
    console.log(`  daysCompleted: ${r.daysCompleted.join(",")}`);
    console.log(`  maxDay: ${r.maxDay}`);
    console.log(`  daily_learning_completed_day: ${r.daily_learning_completed_day}`);
    console.log(`  hair_loss_location: ${r.hairLossLocation}`);
    console.log(`  support_needs: ${r.supportNeeds.join(",") || "(none)"}`);
  }

  console.log(`\n═══ 5 SAMPLE CHURNERS ═══`);
  for (const r of churners.slice(0, 5)) {
    console.log(`\nUID: ${r.uid}`);
    console.log(`  RC age: ${r.ageDays}d   sub period: ${r.periodDays}d   sub count: ${r.subCount}`);
    console.log(`  starts_at: ${new Date(r.earliestStart).toISOString()}`);
    console.log(`  latestEnd: ${new Date(r.latestEnd).toISOString()}`);
    console.log(`  total_duration_days: ${Math.round((r.latestEnd - r.earliestStart) / DAY_MS)}`);
    console.log(`  product_id: ${r.productId}`);
    console.log(`  daysCompleted: ${r.daysCompleted.join(",")}`);
    console.log(`  maxDay: ${r.maxDay}`);
    console.log(`  daily_learning_completed_day: ${r.daily_learning_completed_day}`);
    console.log(`  hair_loss_location: ${r.hairLossLocation}`);
    console.log(`  support_needs: ${r.supportNeeds.join(",") || "(none)"}`);
  }

  // Validate the fix_dandruff 7.20x claim explicitly
  console.log(`\n═══ THE fix_dandruff CLAIM (7.20x lift) — verify ═══`);
  const renewersWithDandruff = renewers.filter(r => r.supportNeeds.includes("fix_dandruff"));
  const churnersWithDandruff = churners.filter(r => r.supportNeeds.includes("fix_dandruff"));
  console.log(`Renewers who selected fix_dandruff: ${renewersWithDandruff.length}/${renewers.length} = ${(renewersWithDandruff.length/renewers.length*100).toFixed(1)}%`);
  console.log(`Churners who selected fix_dandruff: ${churnersWithDandruff.length}/${churners.length} = ${(churnersWithDandruff.length/churners.length*100).toFixed(1)}%`);
  console.log(`UIDs of renewers with fix_dandruff: ${renewersWithDandruff.map(r => r.uid).join(", ")}`);
  console.log(`UIDs of churners with fix_dandruff: ${churnersWithDandruff.map(r => r.uid).join(", ")}`);
  console.log(`⚠ With churner n=${churnersWithDandruff.length}, the 7.20x is fragile — one user flips it.`);

  // Day 30+ claim: 56% renewers vs 19% churners
  console.log(`\n═══ THE day_30+ CLAIM (2.89x lift) — verify ═══`);
  const renewersDay30 = renewers.filter(r => r.maxDay >= 30);
  const churnersDay30 = churners.filter(r => r.maxDay >= 30);
  console.log(`Renewers who reached day 30+: ${renewersDay30.length}/${renewers.length} = ${(renewersDay30.length/renewers.length*100).toFixed(1)}%`);
  console.log(`Churners who reached day 30+: ${churnersDay30.length}/${churners.length} = ${(churnersDay30.length/churners.length*100).toFixed(1)}%`);
  console.log(`Sample 5 renewer UIDs that reached day 30+: ${renewersDay30.slice(0,5).map(r => r.uid).join(", ")}`);
  console.log(`Sample 5 churner UIDs that DIDN'T: ${churners.filter(r => r.maxDay < 30).slice(0,5).map(r => r.uid).join(", ")}`);

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
