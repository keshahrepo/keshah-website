import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const EMAIL = process.argv[2] || "6v7xsfs7hb@privaterelay.appleid.com";

(async () => {
  let authUid: string | null = null;
  try {
    const u = await auth.getUserByEmail(EMAIL);
    authUid = u.uid;
    console.log(`Auth UID: ${u.uid} · created ${u.metadata.creationTime}`);
  } catch { console.log("Auth: not found"); }

  const snap = await db.collection("Users").where("email", "==", EMAIL).get();
  console.log(`Firestore docs: ${snap.size}\n`);

  for (const d of snap.docs) {
    const x = d.data() as any;
    console.log(`═══ ${d.id} ═══`);
    console.log(`  email:                            ${x.email}`);
    console.log(`  selected_gender:                  ${x.selected_gender}`);
    console.log(`  user_type:                        ${x.user_type}`);
    console.log(`  treatment_stage:                  ${x.treatment_stage}`);
    console.log(`  start_date:                       ${x.start_date?.date || "-"}`);
    console.log(`  free_maintenance_switched_at_day: ${x.free_maintenance_switched_at_day || "-"}`);
    console.log(`  free_maintenance_switched_at_date:${x.free_maintenance_switched_at_date || "-"}`);
    console.log(`  userLocalTimeZone:                ${x.userLocalTimeZone || x.user_local_time_zone || "-"}`);
    console.log(`  extra_user_tags:                  ${JSON.stringify(x.extra_user_tags || [])}`);

    // Compute current day
    const sdRaw = x.start_date?.date;
    if (sdRaw) {
      const [dd, mm, yyyy] = sdRaw.split("/").map(Number);
      const start = new Date(yyyy, mm - 1, dd);
      const now = new Date();
      const days = Math.floor((now.getTime() - start.getTime()) / 86400000) + 1;
      console.log(`  computed user_day:                ${days}`);
    }

    // Inspect recent progress
    const progressField = x.treatment_stage === "REGROWTH" ? "regrowth_progress"
                        : x.treatment_stage === "FREE_MAINTENANCE" ? "maintenance_progress"
                        : "progress";
    const prog = x[progressField] || {};
    const keys = Object.keys(prog).sort((a, b) => {
      const da = parseInt(a.replace("day", ""));
      const db = parseInt(b.replace("day", ""));
      return da - db;
    });
    console.log(`\n  progress field: ${progressField}`);
    console.log(`  days stored: ${keys.length} · range: ${keys[0]} → ${keys[keys.length-1]}`);

    // Show last 5 days
    const last5 = keys.slice(-5);
    for (const k of last5) {
      const tasks = prog[k];
      if (!Array.isArray(tasks)) continue;
      console.log(`\n  ${k} — ${tasks.length} tasks:`);
      for (const t of tasks) {
        const vidCount = t.videos?.length || 0;
        const done = t.is_completed ? "✓" : "·";
        console.log(`    ${done} ${t.exercise_id?.padEnd(22)} dur=${t.duration} videos=${vidCount}${t.completed_time ? ` done@${t.completed_time}` : ""}`);
      }
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
