import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  // Grab the first broken user and look at their exact structure
  const doc = await db.collection("Users").doc("0y2EBz2FVyWRfOj9hYyEh7k3dQO2").get();
  const x = doc.data() as any;
  const mp = x.maintenance_progress;
  console.log(`User: ${x.email}`);
  console.log(`Switched to maintenance: ${x.free_maintenance_switched_at_date}`);
  console.log(`Maintenance progress keys: ${Object.keys(mp).sort().join(", ")}\n`);

  // Dump full structure of the latest broken day
  for (const [key, tasks] of Object.entries(mp)) {
    if (!Array.isArray(tasks)) continue;
    const brokenTasks = tasks.filter((t: any) => !t.videos || t.videos.length === 0);
    if (brokenTasks.length > 0) {
      console.log(`\n═══ ${key} — ${tasks.length} tasks, ${brokenTasks.length} broken ═══`);
      console.log(JSON.stringify(tasks, null, 2));
      break;
    }
  }

  // Also check a NON-broken day to compare
  for (const [key, tasks] of Object.entries(mp)) {
    if (!Array.isArray(tasks)) continue;
    const brokenTasks = tasks.filter((t: any) => !t.videos || t.videos.length === 0);
    if (brokenTasks.length === 0) {
      console.log(`\n═══ ${key} — HEALTHY day (for comparison) ═══`);
      console.log(JSON.stringify(tasks, null, 2));
      break;
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
