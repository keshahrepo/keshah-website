import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users").where("email", "==", "jp659@georgetown.edu").limit(1).get();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const x = snap.docs[0].data() as any;

  console.log(`start_date: ${x.start_date?.date}  user_type: ${x.user_type}  treatment_stage: ${x.treatment_stage}`);
  console.log("");

  let totalCompleted = 0;
  for (const f of ["progress", "regrowth_progress", "maintenance_progress"]) {
    const p = x[f] || {};
    const keys = Object.keys(p);
    let completed = 0;
    let max = 0;
    for (const k of keys) {
      const n = parseInt(k.replace("day", ""));
      if (!isNaN(n) && n > max) max = n;
      const tasks = p[k];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (Array.isArray(tasks) && tasks.some((t: any) => t?.is_completed === true)) completed++;
    }
    totalCompleted += completed;
    console.log(`${f.padEnd(22)} stored=${keys.length}  completed=${completed}  maxDay=${max}`);
  }
  console.log(`\nTOTAL completed (any field): ${totalCompleted}`);

  // Compute days since start
  if (x.start_date?.date) {
    const [dd, mm, yyyy] = x.start_date.date.split("/").map(Number);
    const start = new Date(yyyy, mm - 1, dd);
    const days = Math.floor((Date.now() - start.getTime()) / 86400000) + 1;
    console.log(`Days since start_date:        ${days}`);
  }

  process.exit(0);
})();
