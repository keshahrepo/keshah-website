// For paid users (converted_at set OR pro=true), count how many
// distinct trial days (Day 1..7) they completed at least one task on.
// Same +162 cohort with 10-day maturity cutoff so everyone had a full
// trial window.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const TEST_EMAIL = /^test\d+@test\.com$/i;
const COHORT_FROM = new Date("2026-08-18T00:00:00Z");
const COHORT_TO = new Date(Date.now() - 10 * 86_400_000);

(async () => {
  const snap = await db.collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(COHORT_FROM))
    .where("created_at", "<=", Timestamp.fromDate(COHORT_TO))
    .get();

  const paidUsers: { uid: string; daysWithAnyCompletion: number; daysAllCompleted: number }[] = [];
  for (const d of snap.docs) {
    const u:any = d.data();
    if (u.is_deleted) continue;
    if (typeof u.email === "string" && TEST_EMAIL.test(u.email)) continue;
    const paid = u.converted_at != null || u.pro === true;
    if (!paid) continue;

    const progress = u.progress ?? {};
    let anyDone = 0;
    let allDone = 0;
    for (let day = 1; day <= 7; day++) {
      const dayList = progress[`day${day}`];
      if (!Array.isArray(dayList) || dayList.length === 0) continue;
      const completed = dayList.filter((e:any) => e?.is_completed === true).length;
      if (completed > 0) anyDone++;
      if (completed === dayList.length) allDone++;
    }
    paidUsers.push({ uid: d.id, daysWithAnyCompletion: anyDone, daysAllCompleted: allDone });
  }

  console.log(`Paid users in cohort: ${paidUsers.length}\n`);

  console.log("== Distribution: Days 1-7 with AT LEAST ONE task completed ==");
  const anyHist: Record<number, number> = {};
  for (const u of paidUsers) anyHist[u.daysWithAnyCompletion] = (anyHist[u.daysWithAnyCompletion] ?? 0) + 1;
  for (let d = 0; d <= 7; d++) {
    const c = anyHist[d] ?? 0;
    const pct = paidUsers.length ? (c / paidUsers.length * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(c / Math.max(...Object.values(anyHist)) * 40));
    console.log(`  ${d} days: ${String(c).padStart(4)}  ${pct.padStart(5)}%  ${bar}`);
  }

  console.log("\n== Distribution: Days 1-7 FULLY completed (all tasks) ==");
  const allHist: Record<number, number> = {};
  for (const u of paidUsers) allHist[u.daysAllCompleted] = (allHist[u.daysAllCompleted] ?? 0) + 1;
  for (let d = 0; d <= 7; d++) {
    const c = allHist[d] ?? 0;
    const pct = paidUsers.length ? (c / paidUsers.length * 100).toFixed(1) : "0.0";
    const bar = "█".repeat(Math.round(c / Math.max(...Object.values(allHist)) * 40));
    console.log(`  ${d} days: ${String(c).padStart(4)}  ${pct.padStart(5)}%  ${bar}`);
  }

  const avgAny = paidUsers.reduce((s,u) => s + u.daysWithAnyCompletion, 0) / paidUsers.length;
  const avgAll = paidUsers.reduce((s,u) => s + u.daysAllCompleted, 0) / paidUsers.length;
  console.log(`\nAvg days any-task-completed: ${avgAny.toFixed(2)} / 7`);
  console.log(`Avg days fully-completed:    ${avgAll.toFixed(2)} / 7`);
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
