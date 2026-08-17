import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("start_date", "!=", null).get();
  const users = snap.docs.filter(d => !d.data().is_deleted);
  const now = Date.now();
  const DAY_MS = 86_400_000;

  const buckets = [
    { label: "90-100%", min: 0.9, max: 1.001, eligible: 0, checkedIn: 0, stoppage: 0 },
    { label: "70-89%",  min: 0.7, max: 0.9, eligible: 0, checkedIn: 0, stoppage: 0 },
    { label: "50-69%",  min: 0.5, max: 0.7, eligible: 0, checkedIn: 0, stoppage: 0 },
    { label: "25-49%",  min: 0.25, max: 0.5, eligible: 0, checkedIn: 0, stoppage: 0 },
    { label: "<25%",    min: 0,   max: 0.25, eligible: 0, checkedIn: 0, stoppage: 0 },
  ];

  for (const d of users) {
    const data = d.data();
    const createdAt = data.created_at?.toDate?.();
    if (!createdAt) continue;
    const ageDays = Math.floor((now - createdAt.getTime()) / DAY_MS);
    if (ageDays < 60) continue;

    const progress = data.progress as Record<string, Array<{ is_completed?: boolean }>> | undefined;
    let completedDays = 0;
    if (progress) {
      for (const [, exercises] of Object.entries(progress)) {
        if (Array.isArray(exercises) && exercises.length > 0 && exercises.every(e => e.is_completed === true)) {
          completedDays++;
        }
      }
    }
    const daysConsidered = Math.min(ageDays, 60);
    const adherence = daysConsidered > 0 ? completedDays / daysConsidered : 0;

    const bucket = buckets.find(b => adherence >= b.min && adherence < b.max) || buckets[buckets.length-1];
    bucket.eligible++;
    if (data.check_in_day_60_completed === true) bucket.checkedIn++;
    if (data.hair_loss_stoppage_reported_at) bucket.stoppage++;
  }

  console.log(`=== Stoppage rate by adherence (users ≥60 days old) ===\n`);
  console.log(`Adherence    | Total  | Did Check-in | Reported Stoppage | Stoppage %`);
  console.log(`-------------|--------|--------------|-------------------|----------`);
  for (const b of buckets) {
    if (b.eligible === 0) continue;
    const rateCheckIn = b.checkedIn > 0 ? Math.round((b.stoppage/b.checkedIn)*100) : 0;
    console.log(`${b.label.padEnd(13)}| ${String(b.eligible).padEnd(7)}| ${String(b.checkedIn).padEnd(13)}| ${String(b.stoppage).padEnd(18)}| ${rateCheckIn}% of check-in doers`);
  }
  const totalCheckedIn = buckets.reduce((sum, b) => sum + b.checkedIn, 0);
  const totalStoppage = buckets.reduce((sum, b) => sum + b.stoppage, 0);
  const totalEligible = buckets.reduce((sum, b) => sum + b.eligible, 0);
  console.log(`\nTotals: ${totalEligible} eligible · ${totalCheckedIn} checked in · ${totalStoppage} stoppage`);

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
