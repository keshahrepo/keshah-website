import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const LAUNCH = new Date("2026-02-23T00:00:00Z");

(async () => {
  // Look at the post-Feb 23 cohort, any user with start_date
  const snap = await db.collection("Users")
    .where("created_at", ">=", LAUNCH)
    .get();

  let total = 0;
  let hasStartDate = 0;
  let reportedStoppage = 0;
  let confirmedStabilization = 0;
  let hasCheckIns = 0;

  const checkinByDay: Record<number, { total: number; positive: number }> = {};
  const stoppageByDayBucket: Record<string, number> = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.is_deleted || !d.start_date) continue;
    total++;
    hasStartDate++;

    if (d.hair_loss_stoppage_reported_at) {
      reportedStoppage++;
      // Compute on what day user reported (relative to start)
      const reportedAt = d.hair_loss_stoppage_reported_at?.toDate?.();
      const createdAt = d.created_at?.toDate?.();
      if (reportedAt && createdAt) {
        const dayNum = Math.floor((reportedAt.getTime() - createdAt.getTime()) / 86400000);
        const bucket = dayNum < 30 ? "<30" : dayNum < 60 ? "30-59" : dayNum < 90 ? "60-89" : "90+";
        stoppageByDayBucket[bucket] = (stoppageByDayBucket[bucket] || 0) + 1;
      }
    }

    if (d.stabilization_confirmed === true) confirmedStabilization++;

    const checkIns = d.hair_fall_check_ins;
    if (Array.isArray(checkIns) && checkIns.length > 0) {
      hasCheckIns++;
      for (const c of checkIns) {
        const day = c.day;
        const status = c.status;
        if (typeof day !== "number") continue;
        if (!checkinByDay[day]) checkinByDay[day] = { total: 0, positive: 0 };
        checkinByDay[day].total++;
        if (status === "stopped" || status === "improved" || status === "positive") {
          checkinByDay[day].positive++;
        }
      }
    }
  }

  console.log(`=== Cohort: ${total} post-Feb 23 users with start_date ===\n`);
  console.log(`Self-reported OUTCOMES:`);
  console.log(`  hair_loss_stoppage_reported_at set:   ${reportedStoppage}  (${Math.round(reportedStoppage/total*100)}%)`);
  console.log(`  stabilization_confirmed = true:        ${confirmedStabilization}  (${Math.round(confirmedStabilization/total*100)}%)`);
  console.log(`  hair_fall_check_ins array populated:   ${hasCheckIns}  (${Math.round(hasCheckIns/total*100)}%)`);

  if (Object.keys(stoppageByDayBucket).length > 0) {
    console.log(`\nStoppage reported by day since signup:`);
    for (const bucket of ["<30", "30-59", "60-89", "90+"]) {
      if (stoppageByDayBucket[bucket]) console.log(`  Day ${bucket}: ${stoppageByDayBucket[bucket]}`);
    }
  }

  if (Object.keys(checkinByDay).length > 0) {
    console.log(`\nCheck-in outcomes by day:`);
    Object.entries(checkinByDay).sort((a,b) => parseInt(a[0]) - parseInt(b[0])).forEach(([day, stats]) => {
      const pct = stats.total > 0 ? Math.round(stats.positive/stats.total*100) : 0;
      console.log(`  Day ${day.padStart(3)}: ${stats.positive}/${stats.total} positive (${pct}%)`);
    });
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
