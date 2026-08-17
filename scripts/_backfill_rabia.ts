import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

// Backfill Rabia's 4 buggy days. The current app version writes progress
// correctly; the broken entries are leftovers from an older build.
//
//   day3  (Apr 17)  — entries exist, is_completed=false  → flip to true
//   day27 (May 11)  — entries exist, is_completed=false  → flip to true
//   day20 (May 4)   — empty array []                     → seed with day40's 3 exercises
//   day21 (May 5)   — empty array []                     → seed with day40's 3 exercises
//
// All entries get completed_date/completed_time set to the day they would
// have been completed on, computed from start_date (15/04/2026) + (dayN-1).

const START_DATE = "2026-04-15"; // Rabia's start_date.date converted to ISO
const APPLY = process.argv.includes("--apply");

function dayToIsoDate(dayN: number): string {
  const [y, m, d] = START_DATE.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d);
  const target = start + (dayN - 1) * 86400000;
  return new Date(target).toISOString().slice(0, 10);
}

(async () => {
  const snap = await db.collection("Users").where("email", "==", "rabia.ste@gmail.com").limit(1).get();
  if (snap.empty) { console.log("NOT FOUND"); process.exit(1); }
  const ref = snap.docs[0].ref;
  const u: any = snap.docs[0].data();

  // Source-of-truth template — day40's 3 entries, freshly completed today.
  // For the empty-array days (day20, day21) we clone this shape and adjust
  // the completion date/time. For partial days (day3, day27) we just
  // flip is_completed on the existing entries.
  const template = u.progress?.day40;
  if (!Array.isArray(template) || template.length === 0) {
    console.log("FATAL: day40 template not found");
    process.exit(1);
  }

  const updates: Record<string, unknown> = {};
  const log: string[] = [];

  // Helper: flip existing entries to completed
  function flipToComplete(dayN: number, entries: any[]): any[] {
    const completedDate = dayToIsoDate(dayN);
    return entries.map((e: any) => ({
      ...e,
      is_completed: true,
      completed_date: completedDate,
      completed_time: e?.completed_time || "20:00",
    }));
  }

  // Helper: clone template + retag dates
  function seedFromTemplate(dayN: number): any[] {
    const completedDate = dayToIsoDate(dayN);
    return template.map((t: any) => ({
      ...t,
      is_completed: true,
      completed_date: completedDate,
      completed_time: "20:00",
    }));
  }

  // day3 — flip existing 4 entries to completed
  const day3 = u.progress?.day3;
  if (Array.isArray(day3) && day3.length > 0) {
    updates["progress.day3"] = flipToComplete(3, day3);
    log.push(`day3 (${dayToIsoDate(3)}): flip ${day3.length} entries → complete`);
  } else {
    updates["progress.day3"] = seedFromTemplate(3);
    log.push(`day3 (${dayToIsoDate(3)}): seed 3 entries from template`);
  }

  // day27 — flip existing 3 entries to completed
  const day27 = u.progress?.day27;
  if (Array.isArray(day27) && day27.length > 0) {
    updates["progress.day27"] = flipToComplete(27, day27);
    log.push(`day27 (${dayToIsoDate(27)}): flip ${day27.length} entries → complete`);
  } else {
    updates["progress.day27"] = seedFromTemplate(27);
    log.push(`day27 (${dayToIsoDate(27)}): seed 3 entries from template`);
  }

  // day20, day21 — empty arrays, seed from template
  updates["progress.day20"] = seedFromTemplate(20);
  log.push(`day20 (${dayToIsoDate(20)}): seed 3 entries from template (was empty array)`);
  updates["progress.day21"] = seedFromTemplate(21);
  log.push(`day21 (${dayToIsoDate(21)}): seed 3 entries from template (was empty array)`);

  updates["modified_at"] = FieldValue.serverTimestamp();

  console.log("Plan:");
  log.forEach((l) => console.log("  ✓ " + l));
  console.log("");

  if (!APPLY) {
    console.log("DRY RUN — pass --apply to execute");
    process.exit(0);
  }

  await ref.update(updates);
  console.log("✓ Applied. Rabia's calendar should now show all 4 days green.");

  // Verify
  const fresh = (await ref.get()).data() as any;
  for (const dayN of [3, 20, 21, 27]) {
    const e = fresh.progress[`day${dayN}`];
    const allDone = Array.isArray(e) && e.length > 0 && e.every((x: any) => x?.is_completed === true);
    console.log(`  day${dayN}: ${e.length} entries, allComplete=${allDone}`);
  }
  process.exit(0);
})().catch((e: any) => { console.error(e); process.exit(1); });
