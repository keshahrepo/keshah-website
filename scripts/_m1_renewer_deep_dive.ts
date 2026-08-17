// Deep-dive on the 79 M1 renewers: what specifically do they do?
//
// We already know who they are (RC monthly subscribers ≥35d with renewal).
// Now we extract every behavior signal we have on them and compare to
// the 36 M1 churners side-by-side.

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
      if (done % 500 === 0) process.stderr.write(`  ${done}/${items.length}\r`);
    }
  }));
  return out;
}

const DAY_MS = 86400000;

interface UserRecord {
  uid: string;
  // RC
  monthlyStartMs: number;
  ageDays: number;
  renewed: boolean;
  productId: string;
  // Demographics
  gender: string;
  hairLossLocation: string;
  hairGoal: string;
  commitmentAnswer: string;
  supportNeeds: string[];
  country: string;
  // Behavior
  daysCompleted: number[];           // list of day numbers completed
  maxDay: number;
  completionRateInTenure: number;     // days_completed / age_days
  consecutiveDay1to7: number;         // longest streak in days 1-7
  highestDailyLearningDay: number;
  hasUnlockCelebration: boolean;
  unlockCelebrationDay: number;
  // Misc
  hasLastReminderShowedAt: boolean;
  hasFirstSessionDone: boolean;
  hasRegrowthGoal: boolean;
  hasPainTolerance: boolean;
}

function classifyUser(data: any, subs: Sub[], now: number): UserRecord | null {
  const monthly = subs.filter(s => {
    const days = Math.round((s.current_period_ends_at - s.current_period_starts_at) / DAY_MS);
    return days >= 28 && days <= 32;
  });
  if (monthly.length === 0) return null;
  const monthlyStartMs = Math.min(...monthly.map(s => s.starts_at));
  const latestEnd = Math.max(...monthly.map(s => s.ends_at));
  const ageDays = Math.floor((now - monthlyStartMs) / DAY_MS);
  if (ageDays < 35) return null;
  const totalDur = Math.round((latestEnd - monthlyStartMs) / DAY_MS);
  const renewed = monthly.some(s => s.current_period_starts_at > s.starts_at) || totalDur > 35 || monthly.length > 1;

  const progress = (data.progress ?? {}) as Record<string, unknown[]>;
  const daysCompleted: number[] = [];
  for (let d = 1; d <= 90; d++) {
    if (Array.isArray(progress[`day${d}`]) && progress[`day${d}`].length > 0) daysCompleted.push(d);
  }
  // Longest consecutive streak in days 1-7
  let consecutive = 0, best = 0;
  for (let d = 1; d <= 7; d++) {
    if (daysCompleted.includes(d)) { consecutive++; best = Math.max(best, consecutive); }
    else consecutive = 0;
  }

  const phone = data.phone_number ?? data.phone;
  const country = (phone as { country_code?: string })?.country_code ?? "—";

  return {
    uid: "",  // filled by caller
    monthlyStartMs,
    ageDays,
    renewed,
    productId: monthly[0]?.product_id ?? "—",
    gender: (data.selected_gender as string) ?? "—",
    hairLossLocation: (data.hair_loss_location as string) ?? "—",
    hairGoal: (data.hair_goal as string) ?? "—",
    commitmentAnswer: (data.commitment_answer as string) ?? "—",
    supportNeeds: Array.isArray(data.support_needs) ? data.support_needs as string[] : [],
    country,
    daysCompleted,
    maxDay: daysCompleted.length > 0 ? Math.max(...daysCompleted) : 0,
    completionRateInTenure: ageDays > 0 ? daysCompleted.length / ageDays : 0,
    consecutiveDay1to7: best,
    highestDailyLearningDay: (data.daily_learning_completed_day as number) ?? 0,
    hasUnlockCelebration: typeof data.last_unlock_celebration_day === "number",
    unlockCelebrationDay: (data.last_unlock_celebration_day as number) ?? 0,
    hasLastReminderShowedAt: data.last_photos_progress_reminder_showed_at !== undefined,
    hasFirstSessionDone: data.first_session_done === true,
    hasRegrowthGoal: typeof data.regrowth_goal === "string",
    hasPainTolerance: typeof data.pain_tolerance === "string",
  };
}

(async () => {
  const now = Date.now();

  console.log("Pulling all paidStoppage-tagged users...");
  const snap = await db.collection("Users")
    .where("extra_user_tags", "array-contains", "paidStoppage")
    .get();
  const candidates = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Candidates: ${candidates.length}\n`);

  console.log("Fetching RC subscriptions (concurrency 50)...");
  const results = await batch(candidates, async (d) => {
    const subs = await rcSubs(d.id);
    return { uid: d.id, data: d.data(), subs };
  }, 50);
  process.stderr.write("\n");

  const records: UserRecord[] = [];
  for (const r of results) {
    if (r.subs.length === 0) continue;
    const rec = classifyUser(r.data, r.subs, now);
    if (!rec) continue;
    rec.uid = r.uid;
    records.push(rec);
  }

  const renewers = records.filter(r => r.renewed);
  const churners = records.filter(r => !r.renewed);

  console.log(`=== Cohort: monthly subscribers ≥35d ===`);
  console.log(`  Renewers (M1+): ${renewers.length}`);
  console.log(`  Churners at M1: ${churners.length}`);
  console.log(`  Total:          ${records.length}\n`);

  // ── Behavior comparison ──────────────────────────────────────
  console.log("═══ BEHAVIOR COMPARISON ═══\n");
  console.log("Metric".padEnd(45), "Renewers".padStart(12), "Churners".padStart(12), "Lift".padStart(8));
  console.log("─".repeat(85));

  function compareNum(label: string, fn: (r: UserRecord) => number) {
    const r = avg(renewers.map(fn));
    const c = avg(churners.map(fn));
    const lift = c > 0 ? r / c : (r > 0 ? Infinity : 0);
    console.log(label.padEnd(45), r.toFixed(2).padStart(12), c.toFixed(2).padStart(12), `${lift === Infinity ? "∞" : lift.toFixed(2)}x`.padStart(8));
  }
  function compareRate(label: string, fn: (r: UserRecord) => boolean) {
    const r = renewers.filter(fn).length / renewers.length;
    const c = churners.length > 0 ? churners.filter(fn).length / churners.length : 0;
    const lift = c > 0 ? r / c : (r > 0 ? Infinity : 0);
    console.log(label.padEnd(45), `${(r * 100).toFixed(1)}%`.padStart(12), `${(c * 100).toFixed(1)}%`.padStart(12), `${lift === Infinity ? "∞" : lift.toFixed(2)}x`.padStart(8));
  }

  console.log("\n--- Routine completion ---");
  compareNum("Total days of progress recorded", r => r.daysCompleted.length);
  compareNum("Max day reached in routine", r => r.maxDay);
  compareNum("Days completed per day of tenure", r => r.completionRateInTenure);
  compareNum("Longest streak in days 1-7", r => r.consecutiveDay1to7);

  console.log("\n--- Daily learning ---");
  compareNum("Highest daily learning day", r => r.highestDailyLearningDay);
  compareRate("Reached daily learning ≥3", r => r.highestDailyLearningDay >= 3);
  compareRate("Reached daily learning ≥7", r => r.highestDailyLearningDay >= 7);
  compareRate("Reached daily learning ≥14", r => r.highestDailyLearningDay >= 14);

  console.log("\n--- Week 1 specifics ---");
  compareRate("Day 1 done", r => r.daysCompleted.includes(1));
  compareRate("Day 2 done", r => r.daysCompleted.includes(2));
  compareRate("Day 3 done", r => r.daysCompleted.includes(3));
  compareRate("Day 7 done", r => r.daysCompleted.includes(7));
  compareNum("Days completed in week 1", r => r.daysCompleted.filter(d => d <= 7).length);

  console.log("\n--- Past week 1 ---");
  compareNum("Days completed in days 8-14", r => r.daysCompleted.filter(d => d >= 8 && d <= 14).length);
  compareNum("Days completed in days 15-30", r => r.daysCompleted.filter(d => d >= 15 && d <= 30).length);
  compareRate("Reached day 14+", r => r.maxDay >= 14);
  compareRate("Reached day 21+", r => r.maxDay >= 21);
  compareRate("Reached day 30+", r => r.maxDay >= 30);

  console.log("\n--- Profile depth ---");
  compareRate("Has commitment_answer = yes", r => r.commitmentAnswer === "yes");
  compareRate("Has unlock celebration tracked", r => r.hasUnlockCelebration);
  compareNum("Highest unlock celebration day", r => r.unlockCelebrationDay);
  compareRate("Has reminder timestamp set", r => r.hasLastReminderShowedAt);
  compareRate("first_session_done = true", r => r.hasFirstSessionDone);
  compareRate("Has regrowth_goal set", r => r.hasRegrowthGoal);
  compareRate("Has pain_tolerance set", r => r.hasPainTolerance);

  console.log("\n--- Support needs ---");
  compareNum("Avg # support needs selected", r => r.supportNeeds.length);
  compareRate("Selected 0 support needs", r => r.supportNeeds.length === 0);
  compareRate("Selected ≥3 support needs", r => r.supportNeeds.length >= 3);
  compareRate("Selected dht_hormones", r => r.supportNeeds.includes("dht_hormones"));
  compareRate("Selected get_off_medication", r => r.supportNeeds.includes("get_off_medication"));
  compareRate("Selected stress", r => r.supportNeeds.includes("stress"));
  compareRate("Selected diet", r => r.supportNeeds.includes("diet"));
  compareRate("Selected fix_dandruff", r => r.supportNeeds.includes("fix_dandruff"));
  compareRate("Selected bloodwork_vitamins", r => r.supportNeeds.includes("bloodwork_vitamins"));

  console.log("\n--- Demographics ---");
  compareRate("hair_goal = stop_the_loss", r => r.hairGoal === "stop_the_loss");
  compareRate("hair_goal = regrow_hair", r => r.hairGoal === "regrow_hair");
  compareRate("hair_goal = both", r => r.hairGoal === "both");
  compareRate("loss_location = crown", r => r.hairLossLocation === "crown");
  compareRate("loss_location = hairline", r => r.hairLossLocation === "hairline");
  compareRate("loss_location = all_over", r => r.hairLossLocation === "all_over");

  // ── Day-by-day completion percentages (renewers vs churners) ──────────
  console.log("\n═══ DAY-BY-DAY ROUTINE COMPLETION ═══");
  console.log("Day    Renewers %    Churners %    Gap");
  console.log("─".repeat(45));
  for (let d = 1; d <= 30; d++) {
    const rn = renewers.filter(r => r.daysCompleted.includes(d)).length;
    const cn = churners.filter(r => r.daysCompleted.includes(d)).length;
    const rp = (rn / renewers.length) * 100;
    const cp = churners.length > 0 ? (cn / churners.length) * 100 : 0;
    const gap = rp - cp;
    const bar = "▌".repeat(Math.max(0, Math.round(gap / 5)));
    console.log(`${String(d).padStart(3)}    ${rp.toFixed(0).padStart(5)}%    ${cp.toFixed(0).padStart(5)}%    ${gap >= 0 ? "+" : ""}${gap.toFixed(0)}pt ${bar}`);
  }

  // ── Top routine completion percentiles for renewers ───────────────────
  console.log("\n═══ RENEWER ROUTINE COMPLETION DISTRIBUTION ═══");
  const renewerMaxDays = renewers.map(r => r.maxDay).sort((a, b) => a - b);
  if (renewerMaxDays.length > 0) {
    console.log(`max_day p25:  ${renewerMaxDays[Math.floor(renewerMaxDays.length * 0.25)]}`);
    console.log(`max_day p50:  ${renewerMaxDays[Math.floor(renewerMaxDays.length * 0.50)]}`);
    console.log(`max_day p75:  ${renewerMaxDays[Math.floor(renewerMaxDays.length * 0.75)]}`);
    console.log(`max_day p90:  ${renewerMaxDays[Math.floor(renewerMaxDays.length * 0.90)]}`);
  }

  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });

function avg(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
