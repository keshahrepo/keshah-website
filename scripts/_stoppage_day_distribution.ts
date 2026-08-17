import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("hair_loss_stoppage_reported_at", "!=", null).get();
  const users = snap.docs.filter(d => !d.data().is_deleted);
  console.log(`Total users with stoppage reported: ${users.length}`);

  const DAY_MS = 86_400_000;
  const buckets: Record<string, number> = {};
  const bucketOrder = ["<14", "14-29", "30-59", "60-89", "90-119", "120+"];

  for (const d of users) {
    const data = d.data();
    const createdAt = data.created_at?.toDate?.();
    const reportedAtStr = data.hair_loss_stoppage_reported_at;

    let reportedAtMs: number | null = null;
    if (reportedAtStr?.toDate) reportedAtMs = reportedAtStr.toDate().getTime();
    else if (typeof reportedAtStr === "string") {
      // formattedCurrentDay() returns "DD/MM/YYYY"
      const parts = reportedAtStr.split("/");
      if (parts.length === 3) {
        const dt = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
        reportedAtMs = dt.getTime();
      }
    }

    if (!createdAt || !reportedAtMs) continue;
    const dayOfReport = Math.floor((reportedAtMs - createdAt.getTime()) / DAY_MS);
    if (dayOfReport < 0) continue;

    let b: string;
    if (dayOfReport < 14) b = "<14";
    else if (dayOfReport < 30) b = "14-29";
    else if (dayOfReport < 60) b = "30-59";
    else if (dayOfReport < 90) b = "60-89";
    else if (dayOfReport < 120) b = "90-119";
    else b = "120+";
    buckets[b] = (buckets[b] || 0) + 1;
  }

  console.log(`\n=== Day of stoppage report (cumulative distribution) ===\n`);
  let cumul = 0;
  for (const b of bucketOrder) {
    const n = buckets[b] || 0;
    cumul += n;
    const pct = Math.round((cumul / users.length) * 100);
    console.log(`  Day ${b.padEnd(7)}: ${String(n).padStart(3)}  (cumulative ${pct}%)`);
  }

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
