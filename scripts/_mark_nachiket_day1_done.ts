import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "2Co3Y7wG6GUa7Zkb3QYgbpH7WGE3";

(async () => {
  const ref = db.collection("Users").doc(UID);
  const doc = await ref.get();
  const x = doc.data() as any;
  const tasks = x.regrowth_progress?.day1;
  if (!Array.isArray(tasks)) {
    console.log("No regrowth_progress.day1 tasks found");
    process.exit(1);
  }
  const now = new Date();
  const time = now.toLocaleTimeString("en-US", {
    timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const date = "2026-04-22";
  const updated = tasks.map((t: any) => ({
    ...t,
    is_completed: true,
    completed_time: t.completed_time || time,
    completed_date: t.completed_date || date,
  }));
  await ref.update({ "regrowth_progress.day1": updated });
  console.log(`✓ Marked ${updated.length} tasks as completed for ${UID}`);
  for (const t of updated) {
    console.log(`  ✓ ${t.exercise_id} @${t.completed_time} ${t.completed_date}`);
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
