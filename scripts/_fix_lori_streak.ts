// Lori (lharefrazee@swbell.net) — regrowth day 65. She keeps forgetting to hit
// play on the last oil-application video, which leaves tasks with
// is_completed=false so the streak breaks and next day is locked.
//
// This script inspects her regrowth_progress state to find days with any
// incomplete tasks, then (when --apply is passed) marks them all complete.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_fix_lori_streak.ts           # dry-run inspect
//   npx tsx scripts/_fix_lori_streak.ts --apply   # write fix + send confirmation

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "lharefrazee@swbell.net";
const APPLY = process.argv.includes("--apply");

const CONFIRM_MESSAGE =
  `No worries Lori — streak's fixed on our end. Everything you completed is credited, and today's session (microneedling) should unlock when you reopen the app.\n\n` +
  `Quick tip so this doesn't keep happening: after you apply the oil, the video needs to actually play through for the app to log the task. If you close before it finishes, it stays incomplete. Just leave the phone alone for ~10 sec after starting the last oil video and you're set.\n\n` +
  `You're doing amazing — day 65 is real commitment. Keep going.`;

(async () => {
  console.log(`▸ Lookup: ${EMAIL}`);
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) { console.log("  ✗ not found"); process.exit(1); }
  const UID = snap.docs[0].id;
  const x = snap.docs[0].data() as any;
  console.log(`  ✓ UID: ${UID}`);
  console.log(`  treatment_stage: ${x.treatment_stage}`);
  console.log(`  regrowth_switched_at_date: ${x.regrowth_switched_at_date}`);

  const rp = x.regrowth_progress ?? {};
  const dayKeys = Object.keys(rp).filter(k => /^day\d+$/.test(k)).sort((a, b) => {
    return parseInt(a.slice(3)) - parseInt(b.slice(3));
  });
  console.log(`\n▸ ${dayKeys.length} regrowth_progress days on record`);

  // Focus on recent days (last 5) — that's where the streak break likely is
  const recent = dayKeys.slice(-5);
  console.log(`\n  Last ${recent.length} days:`);

  const daysWithIncomplete: string[] = [];
  for (const dk of recent) {
    const tasks = Array.isArray(rp[dk]) ? rp[dk] : [];
    const total = tasks.length;
    const done = tasks.filter((t: any) => t.is_completed === true).length;
    const incomplete = tasks.filter((t: any) => t.is_completed !== true);
    console.log(`    ${dk}: ${done}/${total} tasks complete`);
    if (incomplete.length > 0 && total > 0) {
      daysWithIncomplete.push(dk);
      for (const t of incomplete) {
        console.log(`      ✗ ${t.exercise_id ?? t.name ?? "(unknown task)"}`);
      }
    }
  }

  if (daysWithIncomplete.length === 0) {
    console.log(`\n  ✓ No incomplete tasks in the last ${recent.length} days. Nothing to fix.`);
    process.exit(0);
  }

  console.log(`\n▸ Proposed fix: mark all tasks complete in days: ${daysWithIncomplete.join(", ")}`);

  if (!APPLY) {
    console.log(`\n  (dry-run — pass --apply to write)`);
    process.exit(0);
  }

  const now = new Date();
  const time = now.toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "2-digit", minute: "2-digit", hour12: false });
  const date = now.toISOString().slice(0, 10);

  const update: any = {};
  for (const dk of daysWithIncomplete) {
    const tasks = rp[dk];
    update[`regrowth_progress.${dk}`] = tasks.map((t: any) => ({
      ...t,
      is_completed: true,
      completed_time: t.completed_time || time,
      completed_date: t.completed_date || date,
    }));
  }
  await db.collection("Users").doc(UID).update(update);
  console.log(`  ✓ Marked all tasks complete in ${daysWithIncomplete.length} day(s)`);

  console.log(`\n▸ Sending confirmation message`);
  await db.collection("support").doc(UID).collection("messages").add({
    fromId: "0",
    content: CONFIRM_MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`  ✓ message sent`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
