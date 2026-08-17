// Regrowth conversion cohort analysis.
//
// Pulls every user on treatment_stage = "REGROWTH" plus the FREE_MAINTENANCE
// cohort (the pool they converted from), and reports:
//   • when each converter switched (timeline)
//   • what stage they came from (FREE_MAINTENANCE vs FREE_STOPPAGE_EXT etc.)
//   • how long they spent on free maintenance before converting
//   • RC entitlements / subscription status if available
//   • completion stats — how active were converters before vs after switch
//   • differentiating fields between converters and non-converters at the
//     same funnel stage
//
// Usage: npx tsx scripts/_regrowth_cohort_analysis.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

function parseDDMMYYYY(s: string | undefined): Date | null {
  if (!s) return null;
  const [dd, mm, yyyy] = s.split("/").map(Number);
  if (!dd || !mm || !yyyy) return null;
  return new Date(yyyy, mm - 1, dd);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

function countCompletedDays(progressMap: Record<string, unknown> | undefined): number {
  if (!progressMap) return 0;
  let n = 0;
  for (const k of Object.keys(progressMap)) {
    const tasks = (progressMap as Record<string, unknown>)[k];
    if (Array.isArray(tasks)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (tasks.some((t: any) => t?.is_completed === true)) n++;
    }
  }
  return n;
}

(async () => {
  const now = new Date();
  console.log(`Run time: ${now.toISOString()}\n`);

  // Pull the four key cohorts.
  const stages = ["REGROWTH", "FREE_MAINTENANCE", "FREE_STOPPAGE_EXT", "FREE_STOPPAGE"];
  const buckets: Record<string, FirebaseFirestore.QueryDocumentSnapshot[]> = {};
  for (const s of stages) {
    const snap = await db.collection("Users").where("treatment_stage", "==", s).get();
    buckets[s] = snap.docs;
  }

  console.log("═══════════════ COHORT SIZES ═══════════════");
  for (const s of stages) {
    console.log(`  ${s.padEnd(22)} ${buckets[s].length}`);
  }
  console.log();

  // ─── Regrowth converter analysis ───────────────────────────────────
  const converters = buckets["REGROWTH"];
  if (converters.length === 0) {
    console.log("No regrowth users found.");
    process.exit(0);
  }

  console.log("═══════════════ REGROWTH CONVERTERS ═══════════════\n");

  type Row = {
    uid: string;
    email: string;
    user_type: string;
    start_date: Date | null;
    switch_date: Date | null;
    days_on_journey_before_switch: number | null;
    days_since_switch: number | null;
    pre_switch_completed: number;     // days completed in `progress` (the original 120-day program)
    post_switch_completed: number;    // days completed in `regrowth_progress`
    has_rc_entitlement: boolean;      // entitlements.regrowth or any active RC sub
    consultation_completed: boolean;
    session_day: string | null;       // weekday they picked
    sessions_completed: number;
  };

  const rows: Row[] = [];

  for (const doc of converters) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = doc.data() as any;
    const start = parseDDMMYYYY(x.start_date?.date);
    const switchDate = parseDDMMYYYY(x.regrowth_switched_at_date);
    const row: Row = {
      uid: doc.id,
      email: x.email || "(no email)",
      user_type: x.user_type || "(unset)",
      start_date: start,
      switch_date: switchDate,
      days_on_journey_before_switch: start && switchDate ? daysBetween(start, switchDate) : null,
      days_since_switch: switchDate ? daysBetween(switchDate, now) : null,
      pre_switch_completed: countCompletedDays(x.progress),
      post_switch_completed: countCompletedDays(x.regrowth_progress),
      has_rc_entitlement: Boolean(
        x.entitlements?.regrowth ||
        x.rc_entitlements?.regrowth ||
        x.regrowth_entitlement === true ||
        x.has_active_subscription === true
      ),
      consultation_completed: x.regrowth_consultation_completed === true,
      session_day: x.regrowth_session_day || null,
      sessions_completed: typeof x.microneedling_sessions_completed === "number"
        ? x.microneedling_sessions_completed
        : 0,
    };
    rows.push(row);
  }

  // Sort by switch date (oldest converter first)
  rows.sort((a, b) => {
    const ax = a.switch_date?.getTime() ?? 0;
    const bx = b.switch_date?.getTime() ?? 0;
    return ax - bx;
  });

  // Summary stats
  const withSwitch = rows.filter(r => r.switch_date);
  const switchDates = withSwitch.map(r => r.switch_date!).sort((a, b) => a.getTime() - b.getTime());
  console.log(`Total converters:      ${rows.length}`);
  console.log(`  Has switch_date:     ${withSwitch.length}`);
  console.log(`  Missing switch_date: ${rows.length - withSwitch.length}`);
  if (switchDates.length > 0) {
    console.log(`  First conversion:    ${switchDates[0].toISOString().slice(0, 10)}`);
    console.log(`  Latest conversion:   ${switchDates[switchDates.length - 1].toISOString().slice(0, 10)}`);
  }

  // Distribution of days between start and switch (how long it took to convert)
  const journeyLens = withSwitch
    .map(r => r.days_on_journey_before_switch)
    .filter((n): n is number => n !== null && n >= 0)
    .sort((a, b) => a - b);
  if (journeyLens.length > 0) {
    const median = journeyLens[Math.floor(journeyLens.length / 2)];
    const mean = Math.round(journeyLens.reduce((s, n) => s + n, 0) / journeyLens.length);
    console.log(`  Journey length before switch (days):`);
    console.log(`    min/median/mean/max: ${journeyLens[0]} / ${median} / ${mean} / ${journeyLens[journeyLens.length - 1]}`);
  }

  // Conversions by month (timeline)
  const byMonth: Record<string, number> = {};
  for (const r of withSwitch) {
    const ym = r.switch_date!.toISOString().slice(0, 7);
    byMonth[ym] = (byMonth[ym] || 0) + 1;
  }
  console.log(`\n  Conversions by month:`);
  for (const ym of Object.keys(byMonth).sort()) {
    console.log(`    ${ym}  ${"█".repeat(byMonth[ym])}  ${byMonth[ym]}`);
  }

  // Activity post-switch
  const activePost = rows.filter(r => r.post_switch_completed > 0).length;
  const consultDone = rows.filter(r => r.consultation_completed).length;
  const dayPicked = rows.filter(r => r.session_day).length;
  console.log(`\n  Post-switch engagement:`);
  console.log(`    Did at least 1 regrowth day: ${activePost} / ${rows.length}`);
  console.log(`    Completed consultation:      ${consultDone} / ${rows.length}`);
  console.log(`    Picked a session day:        ${dayPicked} / ${rows.length}`);
  const sessionsDist: Record<number, number> = {};
  for (const r of rows) sessionsDist[r.sessions_completed] = (sessionsDist[r.sessions_completed] || 0) + 1;
  console.log(`    Microneedling sessions completed:`);
  for (const s of Object.keys(sessionsDist).map(Number).sort((a, b) => a - b)) {
    console.log(`      ${s} sessions: ${sessionsDist[s]} users`);
  }

  // Per-user table
  console.log(`\n═══════════════ FULL CONVERTER LIST ═══════════════\n`);
  console.log(
    "switch_date".padEnd(12) +
    "email".padEnd(38) +
    "type".padEnd(9) +
    "j_len".padEnd(7) +
    "pre".padEnd(5) +
    "post".padEnd(6) +
    "sess".padEnd(6) +
    "consult".padEnd(9) +
    "day"
  );
  console.log("-".repeat(110));
  for (const r of rows) {
    const sw = r.switch_date ? r.switch_date.toISOString().slice(0, 10) : "?";
    const jlen = r.days_on_journey_before_switch?.toString() ?? "?";
    console.log(
      sw.padEnd(12) +
      r.email.slice(0, 36).padEnd(38) +
      r.user_type.slice(0, 8).padEnd(9) +
      jlen.padEnd(7) +
      r.pre_switch_completed.toString().padEnd(5) +
      r.post_switch_completed.toString().padEnd(6) +
      r.sessions_completed.toString().padEnd(6) +
      (r.consultation_completed ? "yes" : "no").padEnd(9) +
      (r.session_day || "-")
    );
  }

  // ─── Comparison: who's at FREE_MAINTENANCE but didn't convert? ──────
  console.log(`\n═══════════════ NON-CONVERTERS (FREE_MAINTENANCE) ═══════════════\n`);
  const fm = buckets["FREE_MAINTENANCE"];
  console.log(`Pool size: ${fm.length}`);
  // Compute their journey length
  const fmJourneys: number[] = [];
  let fmActive = 0;
  for (const doc of fm) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const x = doc.data() as any;
    const start = parseDDMMYYYY(x.start_date?.date);
    if (start) {
      const len = daysBetween(start, now);
      fmJourneys.push(len);
    }
    if (countCompletedDays(x.progress) > 0 || countCompletedDays(x.maintenance_progress) > 0) {
      fmActive++;
    }
  }
  fmJourneys.sort((a, b) => a - b);
  if (fmJourneys.length > 0) {
    const median = fmJourneys[Math.floor(fmJourneys.length / 2)];
    const mean = Math.round(fmJourneys.reduce((s, n) => s + n, 0) / fmJourneys.length);
    console.log(`  Days since start (current state):`);
    console.log(`    min/median/mean/max: ${fmJourneys[0]} / ${median} / ${mean} / ${fmJourneys[fmJourneys.length - 1]}`);
  }
  console.log(`  Active (any completed day): ${fmActive} / ${fm.length}`);

  console.log(`\n  Conversion rate (REGROWTH / (REGROWTH + FREE_MAINTENANCE)):`);
  const cr = converters.length / (converters.length + fm.length);
  console.log(`    ${(cr * 100).toFixed(1)}%`);

  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
