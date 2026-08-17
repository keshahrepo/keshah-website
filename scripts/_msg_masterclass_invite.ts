// Batch-invite non-India, non-purchaser members to the microneedling
// masterclass. Sends the invite message to support/{uid}/messages so it
// lands in each user's in-app support inbox.
//
// Segmentation:
//   - user_local_time_zone != "Asia/Kolkata" (India excluded — kit not
//     shipped there anyway on the masterclass funnel)
//   - regrowth_treatment_purchased != true (kit owners aren't the target;
//     they already have what the masterclass sells)
//   - is_deleted != true
//   - has an email
//
// Optional narrowing (uncomment blocks below to restrict cohort):
//   - treatment_stage in ["FREE_STOPPAGE","FREE_STOPPAGE_EXT","FREE_MAINTENANCE"]
//   - created_at older than N days
//
// Dry-run by default. Pass APPLY=1 or --apply to actually send.
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_msg_masterclass_invite.ts               # dry-run
//   APPLY=1 npx tsx scripts/_msg_masterclass_invite.ts       # send

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

// Update this to the actual Calendly link before running the batch send.
// The banner in-app reads from Firestore config, but the invite message
// includes a direct link so users don't have to hunt for it.
const CALENDLY_URL =
  process.env.MASTERCLASS_CALENDLY_URL ||
  "https://calendly.com/aadi-keshah/microneedling-masterclass";

const EXCLUDE_EMAILS = new Set<string>([
  // add test / duplicate accounts here if needed
]);

function buildMessage(firstName: string): string {
  const name = firstName?.trim() || "there";
  return (
    `Hey ${name} — quick invite from the KESHAH team.\n\n` +
    `If your hair isn't growing as fast as you'd like, Aadi is running a live microneedling masterclass this Saturday at 11am ET.\n\n` +
    `He'll cover the right depth, the exact technique, how many passthroughs, how to avoid scarring, and what to apply after.\n\n` +
    `4 years of microneedling experience condensed into a 45-minute session + Q&A. This is the fastest way Aadi has found to grow hair back.\n\n` +
    `Exclusively available for KESHAH members. Book your seat here:\n${CALENDLY_URL}\n\n` +
    `If you can't make Saturday, another one runs in two weeks.`
  );
}

(async () => {
  console.log(
    `\n=== Masterclass invite — ${APPLY ? "APPLY (writing!)" : "DRY RUN"} ===\n`
  );
  console.log(`Calendly URL in message body: ${CALENDLY_URL}\n`);

  console.log(`Querying Users…`);
  const snap = await db.collection("Users").get();
  console.log(`  fetched ${snap.size} total user docs.\n`);

  const eligible: {
    uid: string;
    email: string;
    firstName: string;
    treatmentStage: string;
    timezone: string;
  }[] = [];
  let indiaSkipped = 0;
  let purchasedSkipped = 0;
  let deleted = 0;
  let noEmail = 0;
  let excluded = 0;

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
    // Optional treatment_stage narrowing:
    // const stage = x.treatment_stage || "";
    // if (!["FREE_STOPPAGE","FREE_STOPPAGE_EXT","FREE_MAINTENANCE"].includes(stage)) continue;

    eligible.push({
      uid: d.id,
      email: x.email,
      firstName:
        x.first_name || x.wp_user?.display_name?.split(" ")[0] || "",
      treatmentStage: x.treatment_stage || "(none)",
      timezone: tz || "(none)",
    });
  }

  console.log(`Eligible (non-India, non-purchaser, active):  ${eligible.length}`);
  console.log(`Skipped (India timezone):                     ${indiaSkipped}`);
  console.log(`Skipped (already purchased kit):              ${purchasedSkipped}`);
  console.log(`Skipped (is_deleted):                         ${deleted}`);
  console.log(`Skipped (no email):                           ${noEmail}`);
  console.log(`Skipped (explicitly excluded):                ${excluded}\n`);

  // Stage breakdown
  const byStage: Record<string, number> = {};
  for (const u of eligible)
    byStage[u.treatmentStage] = (byStage[u.treatmentStage] || 0) + 1;
  console.log(`By treatment_stage:`);
  for (const [k, v] of Object.entries(byStage).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(25)} ${v}`);
  }

  console.log(`\nFirst 10 eligible:`);
  console.log(
    `  ${"stage".padEnd(20)} ${"name".padEnd(15)} ${"tz".padEnd(22)} email`
  );
  for (const u of eligible.slice(0, 10)) {
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
