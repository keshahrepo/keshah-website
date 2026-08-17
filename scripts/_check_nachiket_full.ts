import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const d = await db.collection("Users").doc("2Co3Y7wG6GUa7Zkb3QYgbpH7WGE3").get();
  const x = d.data() as any;

  for (const field of ["progress", "regrowth_progress", "maintenance_progress"]) {
    const p = x[field];
    if (!p || Object.keys(p).length === 0) {
      console.log(`${field}: (empty)\n`);
      continue;
    }
    const keys = Object.keys(p).sort((a, b) => {
      const na = parseInt(a.replace("day", ""));
      const nb = parseInt(b.replace("day", ""));
      return na - nb;
    });
    console.log(`═══ ${field} ═══`);
    console.log(`  ${keys.length} days, range ${keys[0]} → ${keys[keys.length-1]}`);
    // Show last 3 days
    for (const k of keys.slice(-3)) {
      const tasks = p[k];
      if (!Array.isArray(tasks)) continue;
      const completed = tasks.filter((t: any) => t.is_completed).length;
      console.log(`\n  ${k} — ${tasks.length} tasks, ${completed} completed:`);
      for (const t of tasks) {
        const done = t.is_completed ? "✓" : "·";
        const time = t.completed_time ? ` @${t.completed_time}` : "";
        const date = t.completed_date ? ` ${t.completed_date}` : "";
        console.log(`    ${done} ${t.exercise_id?.padEnd(22)} dur=${t.duration}${time}${date}`);
      }
    }
    console.log();
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
