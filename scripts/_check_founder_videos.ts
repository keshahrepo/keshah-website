// One-off: list which days currently have a founder video task in the
// stoppage exercise schedule (men + women). Verifies the actual current
// state of Firestore vs assumptions.
//
// Usage: npx tsx scripts/_check_founder_videos.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function inspect(collectionName: string) {
  console.log(`\n━━━ ${collectionName} ━━━`);
  const snap = await db.collection(collectionName).get();
  // Sort by day index
  const dayDocs = snap.docs
    .filter(d => /^Day\d+$/i.test(d.id))
    .sort((a, b) => parseInt(a.id.replace(/[^0-9]/g, ""), 10) - parseInt(b.id.replace(/[^0-9]/g, ""), 10));

  for (const doc of dayDocs) {
    const data = doc.data();
    const exercises = (data.exercises || data.tasks || []) as Array<{ id?: string; name?: string }>;
    const founderTasks = exercises.filter(e => {
      const id = (e.id || "").toLowerCase();
      const name = (e.name || "").toLowerCase();
      return id.includes("founder") || id.includes("check_in") || name.includes("founder") || name.includes("check");
    });
    if (founderTasks.length > 0) {
      console.log(`${doc.id}: ${founderTasks.map(t => t.id || t.name).join(", ")}`);
    }
  }
}

(async () => {
  await inspect("FREEV2_MEN_STOPPAGE_EXERCISES");
  await inspect("FREEV2_WOMEN_STOPPAGE_EXERCISES");
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
