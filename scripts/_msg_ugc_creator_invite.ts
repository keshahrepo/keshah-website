// Batch-invite engaged non-India members to become paid TikTok UGC creators.
// Sends to support/{uid}/messages so it lands in each user's in-app inbox.
//
// Filter:
//   - user_local_time_zone != "Asia/Kolkata"  (non-India)
//   - is_deleted != true
//   - has an email
//   - >= 20 days completed in `progress` (day has at least one entry with
//     is_completed: true — pre-populated is_completed:false rows don't count)
//
// Dry-run by default. Pass APPLY=1 or --apply to actually send.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_msg_ugc_creator_invite.ts               # dry-run
//   APPLY=1 npx tsx scripts/_msg_ugc_creator_invite.ts       # send

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");

const TEAM_FROM_ID = "0";
const MIN_COMPLETED_DAYS = 20;

const EXCLUDE_EMAILS = new Set<string>([
  // add test / duplicate accounts here if needed
]);

function countCompletedDays(progress: unknown): number {
  if (!progress || typeof progress !== "object") return 0;
  let count = 0;
  for (const key of Object.keys(progress as Record<string, unknown>)) {
    if (!/^day\d+$/i.test(key)) continue;
    const entries = (progress as Record<string, unknown>)[key];
    if (!Array.isArray(entries)) continue;
    const hasCompleted = entries.some(
      (e) => e && typeof e === "object" && (e as { is_completed?: boolean }).is_completed === true
    );
    if (hasCompleted) count++;
  }
  return count;
}

function buildMessage(firstName: string): string {
  const name = firstName?.trim() || "there";
  return (
    `Hey ${name} — Aadi here.\n\n` +
    `I'm looking for 10 KESHAH members to share their journey on TikTok as paid creators.\n\n` +
    `• 4 short videos per month, filmed on your phone\n` +
    `• We give you scripts, hooks, and edit support — no experience needed\n` +
    `• ~3 hours per week\n` +
    `• $600/month, paid via PayPal\n` +
    `• Videos are marked as paid partnerships (we'll walk you through it)\n\n` +
    `Reply "Interested" and the team will review your KESHAH profile and set up a 15-min intro call if you're a good fit.`
  );
}

(async () => {
  console.log(
    `\n=== UGC creator invite — ${APPLY ? "APPLY (writing!)" : "DRY RUN"} ===\n`
  );
  console.log(`Filter: non-India + >= ${MIN_COMPLETED_DAYS} completed days\n`);

  console.log(`Querying Users…`);
  const snap = await db.collection("Users").get();
  console.log(`  fetched ${snap.size} total user docs.\n`);

  const eligible: {
    uid: string;
    email: string;
    firstName: string;
    completedDays: number;
    treatmentStage: string;
    timezone: string;
    gender: string;
  }[] = [];
  let indiaSkipped = 0;
  let deletedSkipped = 0;
  let noEmail = 0;
  let excluded = 0;
  let notEnoughDays = 0;

  for (const d of snap.docs) {
    const x: any = d.data();
    if (x.is_deleted) {
      deletedSkipped++;
      continue;
    }
    const email = (x.email || "").toLowerCase();
    if (!email) {
      noEmail++;
      continue;
    }
    if (EXCLUDE_EMAILS.has(email)) {
      excluded++;
      continue;
    }
    const tz = x.user_local_time_zone || "";
    if (tz === "Asia/Kolkata") {
      indiaSkipped++;
      continue;
    }
    const completedDays = countCompletedDays(x.progress);
    if (completedDays < MIN_COMPLETED_DAYS) {
      notEnoughDays++;
      continue;
    }

    eligible.push({
      uid: d.id,
      email: x.email,
      firstName:
        x.first_name || x.wp_user?.display_name?.split(" ")[0] || "",
      completedDays,
      treatmentStage: x.treatment_stage || "(none)",
      timezone: tz || "(none)",
      gender: x.selected_gender || "(none)",
    });
  }

  console.log(`Eligible:                                     ${eligible.length}`);
  console.log(`Skipped (India timezone):                     ${indiaSkipped}`);
  console.log(`Skipped (< ${MIN_COMPLETED_DAYS} completed days):              ${notEnoughDays}`);
  console.log(`Skipped (is_deleted):                         ${deletedSkipped}`);
  console.log(`Skipped (no email):                           ${noEmail}`);
  console.log(`Skipped (explicitly excluded):                ${excluded}\n`);

  // Stage breakdown
  const byStage: Record<string, number> = {};
  const byGender: Record<string, number> = {};
  const byTz: Record<string, number> = {};
  for (const u of eligible) {
    byStage[u.treatmentStage] = (byStage[u.treatmentStage] || 0) + 1;
    byGender[u.gender] = (byGender[u.gender] || 0) + 1;
    byTz[u.timezone] = (byTz[u.timezone] || 0) + 1;
  }
  console.log(`By treatment_stage:`);
  for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }
  console.log(`\nBy gender:`);
  for (const [k, v] of Object.entries(byGender).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }
  console.log(`\nTop 8 timezones:`);
  for (const [k, v] of Object.entries(byTz).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }
  console.log(`\nCompleted-days distribution:`);
  const buckets = { "20-29": 0, "30-59": 0, "60-89": 0, "90+": 0 };
  for (const u of eligible) {
    if (u.completedDays < 30) buckets["20-29"]++;
    else if (u.completedDays < 60) buckets["30-59"]++;
    else if (u.completedDays < 90) buckets["60-89"]++;
    else buckets["90+"]++;
  }
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);

  console.log(`\nFirst 10 eligible:`);
  console.log(
    `  ${"days".padEnd(5)} ${"stage".padEnd(20)} ${"gender".padEnd(8)} ${"name".padEnd(15)} ${"tz".padEnd(22)} email`
  );
  for (const u of eligible.slice(0, 10)) {
    console.log(
      `  ${String(u.completedDays).padEnd(5)} ${u.treatmentStage.padEnd(20)} ${u.gender.padEnd(8)} ${(u.firstName || "-").padEnd(15)} ${(u.timezone || "-").padEnd(22)} ${u.email}`
    );
  }

  console.log(`\nMessage preview (for "Alex"):\n`);
  console.log(buildMessage("Alex").replace(/^/gm, "  "));

  if (!APPLY) {
    console.log(`\nDRY RUN — re-run with APPLY=1 to actually send.\n`);
    process.exit(0);
  }

  console.log(`\nWriting messages to support/{uid}/messages…`);
  let ok = 0,
    fail = 0;
  const failures: { uid: string; email: string; error: string }[] = [];
  for (let i = 0; i < eligible.length; i++) {
    const u = eligible[i];
    try {
      await db.collection("support").doc(u.uid).collection("messages").add({
        fromId: TEAM_FROM_ID,
        content: buildMessage(u.firstName),
        attachments: null,
        feedback: null,
        type: "direct",
        timestamp: Timestamp.now(),
      });
      ok++;
    } catch (e: any) {
      fail++;
      failures.push({ uid: u.uid, email: u.email, error: e.message });
    }
    if (i > 0 && i % 25 === 0)
      console.log(`  …${i}/${eligible.length}  ok=${ok} fail=${fail}`);
  }
  console.log(`\nDone. ok=${ok} fail=${fail}`);
  if (failures.length) {
    console.log(`\nFirst 5 failures:`);
    failures.slice(0, 5).forEach((f) =>
      console.log(`  ${f.email}: ${f.error}`)
    );
  }
  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
