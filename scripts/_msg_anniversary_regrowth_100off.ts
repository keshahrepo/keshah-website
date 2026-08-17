// 3-year anniversary $100-off regrowth kit blast.
//
// Filter:
//   - user_local_time_zone != "Asia/Kolkata"      (non-India — kit doesn't ship there via this SKU)
//   - regrowth_treatment_purchased != true         (skip existing kit owners)
//   - is_deleted != true
//   - has email
//   - >= 1 completed day of progress                (has actually used the app)
//
// Dry-run by default. Pass APPLY=1 to actually send.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_msg_anniversary_regrowth_100off.ts             # dry-run
//   APPLY=1 npx tsx scripts/_msg_anniversary_regrowth_100off.ts     # send

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

const EXCLUDE_EMAILS = new Set<string>([]);
const MIN_COMPLETED_DAYS = 1;

/** Count days in `progress` map that have at least one entry with
 *  is_completed: true. Opening the day screen pre-populates entries with
 *  is_completed: false, so non-empty array alone isn't enough. */
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
  const name = firstName?.trim();
  const greet = name ? `${name}, Aadi here.` : `Aadi here.`;
  return (
    `${greet}\n\n` +
    `3 year anniversary of KESHAH and I've never done this, but I want to do something to celebrate…\n\n` +
    `So here it is: $100 off the regrowth kit for the next 24 HOURS ONLY (capped at 20 kits).\n\n` +
    `If you want in, reply 'regrowth' within the next 24 hours. If we still have any kits left, someone on the team will reach out and we'll get you a $100 discount on the kit.\n\n` +
    `Happy anniversary to you and everyone in the KESHAH family :)`
  );
}

(async () => {
  console.log(
    `\n=== Anniversary $100-off regrowth blast — ${APPLY ? "APPLY (writing!)" : "DRY RUN"} ===\n`
  );

  console.log(`Querying Users…`);
  const snap = await db.collection("Users").get();
  console.log(`  fetched ${snap.size} total user docs.\n`);

  const eligible: {
    uid: string;
    email: string;
    firstName: string;
    treatmentStage: string;
    timezone: string;
    completedDays: number;
  }[] = [];
  let indiaSkipped = 0;
  let purchasedSkipped = 0;
  let deleted = 0;
  let noEmail = 0;
  let excluded = 0;
  let notEnoughDays = 0;

  for (const d of snap.docs) {
    const x: any = d.data();
    if (x.is_deleted) {
      deleted++;
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
    if (x.regrowth_treatment_purchased === true) {
      purchasedSkipped++;
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
      treatmentStage: x.treatment_stage || "(none)",
      timezone: tz || "(none)",
      completedDays,
    });
  }

  console.log(`Eligible (>= ${MIN_COMPLETED_DAYS} completed day, non-India, non-purchaser):  ${eligible.length}`);
  console.log(`Skipped (India timezone):                     ${indiaSkipped}`);
  console.log(`Skipped (already purchased kit):              ${purchasedSkipped}`);
  console.log(`Skipped (< ${MIN_COMPLETED_DAYS} completed day):                 ${notEnoughDays}`);
  console.log(`Skipped (is_deleted):                         ${deleted}`);
  console.log(`Skipped (no email):                           ${noEmail}`);
  console.log(`Skipped (explicitly excluded):                ${excluded}\n`);

  // Distribution
  const buckets = { "1-4": 0, "5-14": 0, "15-29": 0, "30-59": 0, "60+": 0 };
  for (const u of eligible) {
    if (u.completedDays < 5) buckets["1-4"]++;
    else if (u.completedDays < 15) buckets["5-14"]++;
    else if (u.completedDays < 30) buckets["15-29"]++;
    else if (u.completedDays < 60) buckets["30-59"]++;
    else buckets["60+"]++;
  }
  console.log(`Completed-day distribution:`);
  for (const [k, v] of Object.entries(buckets)) console.log(`  ${k.padEnd(10)} ${v}`);
  console.log("");

  const byStage: Record<string, number> = {};
  for (const u of eligible)
    byStage[u.treatmentStage] = (byStage[u.treatmentStage] || 0) + 1;
  console.log(`By treatment_stage:`);
  for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }

  console.log(`\nFirst 5 eligible:`);
  console.log(`  ${"stage".padEnd(20)} ${"name".padEnd(15)} ${"tz".padEnd(22)} email`);
  for (const u of eligible.slice(0, 5)) {
    console.log(
      `  ${u.treatmentStage.padEnd(20)} ${(u.firstName || "-").padEnd(15)} ${(u.timezone || "-").padEnd(22)} ${u.email}`
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
