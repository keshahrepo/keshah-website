import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const DAY_MS = 86_400_000;

function toMs(v: any): number | null {
  if (!v) return null;
  if (typeof v?.toDate === "function") return v.toDate().getTime();
  if (typeof v === "string") {
    // "DD/MM/YYYY"
    const p = v.split("/");
    if (p.length === 3) {
      const d = new Date(parseInt(p[2]), parseInt(p[1]) - 1, parseInt(p[0]));
      const t = d.getTime();
      return isNaN(t) ? null : t;
    }
    const t = new Date(v).getTime();
    return isNaN(t) ? null : t;
  }
  return null;
}

function startDateMs(data: any): number | null {
  // start_date can be Timestamp OR a map {date: "DD/MM/YYYY"} OR "DD/MM/YYYY"
  const sd = data.start_date;
  if (!sd) return null;
  if (typeof sd?.toDate === "function") return sd.toDate().getTime();
  if (typeof sd === "string") return toMs(sd);
  if (typeof sd === "object" && sd.date) return toMs(sd.date);
  return null;
}

function pct(n: number, d: number): string {
  if (d === 0) return "n/a";
  return ((n / d) * 100).toFixed(1) + "%";
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function quantile(xs: number[], q: number): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  return s[base + 1] !== undefined ? s[base] + rest * (s[base + 1] - s[base]) : s[base];
}

(async () => {
  console.log("Fetching Users collection (this may take a bit)...");
  const snap = await db.collection("Users").get();
  const all = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total non-deleted users: ${all.length}\n`);

  // Counters
  let anyStoppageData = 0;
  let hasStoppageReportedAt = 0;
  let hasStabilizationConfirmed = 0;
  let hasHairFallCheckIns = 0;
  let hasScalpAnswersLooserYes = 0;
  let hasAnyScalpAnswers = 0;

  let paying = 0;
  let payingAnyStoppage = 0;
  let payingStoppageReportedAt = 0;
  let payingStabilizationConfirmed = 0;
  let payingHairFallCheckInsYes = 0;
  let payingScalpLooserYes = 0;

  // Day when stoppage reported
  const dayFromStabConfirmed: number[] = [];
  const dayFromStoppageReportedAt: number[] = [];
  const dayFromCheckIns: number[] = [];
  const combinedDayReported: number[] = [];

  // Scalp check answers breakdown (Day 6, Day 13)
  const scalpDay6 = { yes: 0, no: 0, not_sure: 0, other: 0, total: 0 };
  const scalpDay13 = { yes: 0, no: 0, not_sure: 0, other: 0, total: 0 };
  const scalpDay3 = { yes: 0, no: 0, not_sure: 0, other: 0, total: 0 };

  // hair_fall_check_ins day distribution & yes rates
  const checkInByDay: Record<number, { yes: number; no: number; total: number }> = {};

  for (const d of all) {
    const data = d.data();
    const isPaying = !!data.converted_at;
    if (isPaying) paying++;

    // 1. hair_loss_stoppage_reported_at
    const stoppageAt = data.hair_loss_stoppage_reported_at;
    const stoppageAtMs = toMs(stoppageAt);
    if (stoppageAt) {
      hasStoppageReportedAt++;
      if (isPaying) payingStoppageReportedAt++;
      const sdMs = startDateMs(data) || data.created_at?.toDate?.().getTime();
      if (sdMs && stoppageAtMs) {
        const day = Math.floor((stoppageAtMs - sdMs) / DAY_MS);
        if (day >= 0 && day <= 400) {
          dayFromStoppageReportedAt.push(day);
          combinedDayReported.push(day);
        }
      }
    }

    // 2. stabilization_confirmed
    if (data.stabilization_confirmed === true) {
      hasStabilizationConfirmed++;
      if (isPaying) payingStabilizationConfirmed++;
      if (typeof data.stabilization_confirmed_at_day === "number") {
        const day = data.stabilization_confirmed_at_day;
        if (day >= 0 && day <= 400) {
          dayFromStabConfirmed.push(day);
          combinedDayReported.push(day);
        }
      }
    }

    // 3. hair_fall_check_ins
    const cis = data.hair_fall_check_ins;
    let userHasCheckInYes = false;
    if (Array.isArray(cis) && cis.length > 0) {
      hasHairFallCheckIns++;
      for (const ci of cis) {
        const day = typeof ci?.day === "number" ? ci.day : parseInt(ci?.day);
        const status = String(ci?.status || "").toLowerCase();
        if (isFinite(day)) {
          if (!checkInByDay[day]) checkInByDay[day] = { yes: 0, no: 0, total: 0 };
          checkInByDay[day].total++;
          if (status === "yes" || status === "stopped" || status === "true") {
            checkInByDay[day].yes++;
            userHasCheckInYes = true;
            const sdMs = startDateMs(data) || data.created_at?.toDate?.().getTime();
            const rMs = toMs(ci?.reported_at);
            if (sdMs && rMs) {
              const dd = Math.floor((rMs - sdMs) / DAY_MS);
              if (dd >= 0 && dd <= 400) dayFromCheckIns.push(dd);
            } else if (isFinite(day) && day >= 0 && day <= 400) {
              dayFromCheckIns.push(day);
              combinedDayReported.push(day);
            }
          } else if (status === "no") {
            checkInByDay[day].no++;
          }
        }
      }
      if (userHasCheckInYes && isPaying) payingHairFallCheckInsYes++;
    }

    // 4. scalp_check_answers (Days 3/6/13)
    const sca = data.scalp_check_answers;
    if (sca && typeof sca === "object") {
      hasAnyScalpAnswers++;
      let looserYesForUser = false;
      for (const [k, v] of Object.entries(sca)) {
        const dayNum = parseInt(String(k).replace(/[^0-9]/g, ""));
        const ans = String(v || "").toLowerCase();
        let bucket: typeof scalpDay6 | null = null;
        if (dayNum === 3) bucket = scalpDay3;
        else if (dayNum === 6) bucket = scalpDay6;
        else if (dayNum === 13) bucket = scalpDay13;
        if (bucket) {
          bucket.total++;
          if (ans === "yes") bucket.yes++;
          else if (ans === "no") bucket.no++;
          else if (ans === "not_sure" || ans === "notsure" || ans === "unsure") bucket.not_sure++;
          else bucket.other++;
        }
        if ((dayNum === 6 || dayNum === 13) && ans === "yes") looserYesForUser = true;
      }
      if (looserYesForUser) {
        hasScalpAnswersLooserYes++;
        if (isPaying) payingScalpLooserYes++;
      }
    }

    // Combined "any stoppage signal"
    const anySignal =
      !!stoppageAt ||
      data.stabilization_confirmed === true ||
      (Array.isArray(cis) && cis.some((c: any) => {
        const s = String(c?.status || "").toLowerCase();
        return s === "yes" || s === "stopped" || s === "true";
      })) ||
      (sca && typeof sca === "object" && Object.entries(sca).some(([k, v]) => {
        const dn = parseInt(String(k).replace(/[^0-9]/g, ""));
        return (dn === 6 || dn === 13) && String(v).toLowerCase() === "yes";
      }));

    if (anySignal) {
      anyStoppageData++;
      if (isPaying) payingAnyStoppage++;
    }
  }

  console.log("========================================");
  console.log("Q1. Users with ANY hair-loss-stoppage signal");
  console.log("========================================");
  console.log(`  Any signal:                          ${anyStoppageData}  (${pct(anyStoppageData, all.length)} of ${all.length} users)`);
  console.log(`    hair_loss_stoppage_reported_at:    ${hasStoppageReportedAt}`);
  console.log(`    stabilization_confirmed == true:   ${hasStabilizationConfirmed}`);
  console.log(`    hair_fall_check_ins non-empty:     ${hasHairFallCheckIns}`);
  console.log(`    scalp_check_answers any populated: ${hasAnyScalpAnswers}`);
  console.log(`    scalp Day6/13 answered 'yes':      ${hasScalpAnswersLooserYes}`);

  console.log("\n========================================");
  console.log("Q2. Paying users (has converted_at)");
  console.log("========================================");
  console.log(`  Paying users total:                  ${paying}`);
  console.log(`  Paying w/ ANY stoppage signal:       ${payingAnyStoppage}  (${pct(payingAnyStoppage, paying)} of paying)`);
  console.log(`    via hair_loss_stoppage_reported_at:${payingStoppageReportedAt}`);
  console.log(`    via stabilization_confirmed:       ${payingStabilizationConfirmed}`);
  console.log(`    via hair_fall_check_ins yes:       ${payingHairFallCheckInsYes}`);
  console.log(`    via scalp_check Day6/13 yes:       ${payingScalpLooserYes}`);

  console.log("\n========================================");
  console.log("Q3. Day-count when stoppage was reported");
  console.log("========================================");
  const printStat = (label: string, arr: number[]) => {
    if (arr.length === 0) { console.log(`  ${label}: n=0`); return; }
    console.log(`  ${label}: n=${arr.length}  median=${median(arr)?.toFixed(0)}  p25=${quantile(arr, 0.25)?.toFixed(0)}  p75=${quantile(arr, 0.75)?.toFixed(0)}  min=${Math.min(...arr)} max=${Math.max(...arr)}`);
  };
  printStat("From stabilization_confirmed_at_day", dayFromStabConfirmed);
  printStat("From (stoppage_reported_at - start_date)", dayFromStoppageReportedAt);
  printStat("From hair_fall_check_ins yes reports", dayFromCheckIns);
  printStat("Combined all sources", combinedDayReported);

  // Bucketed distribution
  console.log("\n  Combined day-of-report distribution:");
  const bkt: Record<string, number> = { "<14": 0, "14-29": 0, "30-59": 0, "60-89": 0, "90-119": 0, "120+": 0 };
  for (const day of combinedDayReported) {
    if (day < 14) bkt["<14"]++;
    else if (day < 30) bkt["14-29"]++;
    else if (day < 60) bkt["30-59"]++;
    else if (day < 90) bkt["60-89"]++;
    else if (day < 120) bkt["90-119"]++;
    else bkt["120+"]++;
  }
  let cum = 0;
  for (const [b, n] of Object.entries(bkt)) {
    cum += n;
    console.log(`    ${b.padEnd(8)} ${String(n).padStart(4)}   cumulative ${pct(cum, combinedDayReported.length)}`);
  }

  console.log("\n========================================");
  console.log("Q4. scalp_check_answers breakdown");
  console.log("========================================");
  const printScalp = (label: string, b: typeof scalpDay6) => {
    console.log(`  ${label} (n=${b.total}):`);
    console.log(`    yes:      ${b.yes} (${pct(b.yes, b.total)})`);
    console.log(`    no:       ${b.no} (${pct(b.no, b.total)})`);
    console.log(`    not_sure: ${b.not_sure} (${pct(b.not_sure, b.total)})`);
    if (b.other > 0) console.log(`    other:    ${b.other} (${pct(b.other, b.total)})`);
  };
  printScalp("Day 3", scalpDay3);
  printScalp("Day 6", scalpDay6);
  printScalp("Day 13", scalpDay13);

  console.log("\n========================================");
  console.log("Q4b. hair_fall_check_ins by day");
  console.log("========================================");
  const days = Object.keys(checkInByDay).map(Number).sort((a, b) => a - b);
  for (const d of days) {
    const b = checkInByDay[d];
    console.log(`  Day ${String(d).padStart(3)}  n=${String(b.total).padStart(4)}  yes=${String(b.yes).padStart(4)} (${pct(b.yes, b.total)})  no=${String(b.no).padStart(4)} (${pct(b.no, b.total)})`);
  }

  console.log("\n========================================");
  console.log("Q5. Defensible claim math");
  console.log("========================================");
  // Restrict to users old enough to have had a chance to report
  // Denominator variants
  const now = Date.now();
  let payingEligible60d = 0;
  let payingEligible60dYes = 0;
  let payingEligible90d = 0;
  let payingEligible90dYes = 0;

  for (const d of all) {
    const data = d.data();
    if (!data.converted_at) continue;
    const createdMs = data.created_at?.toDate?.().getTime();
    if (!createdMs) continue;
    const ageDays = Math.floor((now - createdMs) / DAY_MS);

    const stoppageAt = data.hair_loss_stoppage_reported_at;
    const stab = data.stabilization_confirmed === true;
    const cis = data.hair_fall_check_ins;
    const sca = data.scalp_check_answers;
    const anySignal =
      !!stoppageAt || stab ||
      (Array.isArray(cis) && cis.some((c: any) => ["yes", "stopped", "true"].includes(String(c?.status).toLowerCase()))) ||
      (sca && typeof sca === "object" && Object.entries(sca).some(([k, v]) => {
        const dn = parseInt(String(k).replace(/[^0-9]/g, ""));
        return (dn === 6 || dn === 13) && String(v).toLowerCase() === "yes";
      }));

    if (ageDays >= 60) { payingEligible60d++; if (anySignal) payingEligible60dYes++; }
    if (ageDays >= 90) { payingEligible90d++; if (anySignal) payingEligible90dYes++; }
  }

  console.log(`  Paying users ≥60 days old:  ${payingEligible60d}   reported stoppage: ${payingEligible60dYes} (${pct(payingEligible60dYes, payingEligible60d)})`);
  console.log(`  Paying users ≥90 days old:  ${payingEligible90d}   reported stoppage: ${payingEligible90dYes} (${pct(payingEligible90dYes, payingEligible90d)})`);

  // Among users who *actually reported*, what % were within 60 / 90 days?
  const within60 = combinedDayReported.filter(d => d <= 60).length;
  const within90 = combinedDayReported.filter(d => d <= 90).length;
  console.log(`\n  Of ${combinedDayReported.length} users with a report day: ${within60} (${pct(within60, combinedDayReported.length)}) reported by Day 60; ${within90} (${pct(within90, combinedDayReported.length)}) by Day 90.`);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); console.error(e.stack); process.exit(1); });
