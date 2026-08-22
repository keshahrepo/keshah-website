// Backfill start_date for paid users who are missing it.
//
// Root cause: the RC webhook was setting starter_photos_submit_submitted_once
// = true (which makes splash think onboarding is done) but never seeding
// start_date. Users who paid + closed the app mid-onboarding then landed
// on a blank dashboard because the day loader needs start_date.
//
// Fix already deployed in the RC webhook (matches web save-profile now).
// This backfill uses converted_at as the seed date so their Day 1 clock
// starts from purchase — same behavior as the new webhook write.
//
// Dry-run unless --apply. Only touches users with:
//   - paidStoppage tag set
//   - starter_photos_submit_submitted_once == true
//   - start_date missing
//   - created_at >= 2026-08-18 (+162 cohort — nobody older matters)

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp, FieldValue } from "firebase-admin/firestore";

const APPLY = process.argv.includes("--apply");
const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

function buildStartDate(now: Date, timezone: string) {
  let date: string, time: string, offsetInMins = 0;
  try {
    date = now.toLocaleDateString("en-GB", { timeZone: timezone });
    time = now.toLocaleTimeString("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
    const asTz = new Date(now.toLocaleString("en-US", { timeZone: timezone }));
    const asUtc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
    offsetInMins = Math.round((asTz.getTime() - asUtc.getTime()) / 60000);
  } catch {
    date = now.toLocaleDateString("en-GB", { timeZone: "UTC" });
    time = now.toLocaleTimeString("en-US", { timeZone: "UTC", hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
    timezone = "UTC";
  }
  return { date, time, timezone, timeZoneOffsetInMins: offsetInMins };
}

async function main() {
  const { db } = getFirebaseAdmin();

  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select(
      "email",
      "extra_user_tags",
      "starter_photos_submit_submitted_once",
      "start_date",
      "converted_at",
      "created_at",
      "userLocalTimeZone",
    )
    .get();

  const targets: Array<{ uid: string; seedDate: Date; tz: string; email: string }> = [];
  let skippedNotPaid = 0, skippedHasStartDate = 0, skippedNoFlagYet = 0;

  for (const doc of snap.docs) {
    const d = doc.data();
    if (/^test\d+@test\.com$/i.test(d.email ?? "")) continue;
    if (!Array.isArray(d.extra_user_tags) || !d.extra_user_tags.includes("paidStoppage")) {
      skippedNotPaid++;
      continue;
    }
    if (d.start_date) { skippedHasStartDate++; continue; }
    if (d.starter_photos_submit_submitted_once !== true) { skippedNoFlagYet++; continue; }

    // Seed date preference: converted_at (actual purchase moment),
    // fallback to created_at. Both are Timestamps.
    const convertedTs = d.converted_at as Timestamp | undefined;
    const createdTs = d.created_at as Timestamp | undefined;
    const seedMs =
      convertedTs?.toMillis?.() ??
      createdTs?.toMillis?.() ??
      Date.now();
    const tz = (d.userLocalTimeZone as string | undefined) ?? "UTC";
    targets.push({
      uid: doc.id,
      seedDate: new Date(seedMs),
      tz,
      email: d.email ?? "-",
    });
  }

  console.log(`\n=== Backfill start_date (${APPLY ? "APPLYING" : "DRY RUN"}) ===`);
  console.log(`Cutoff:                  ${RELEASE_CUTOFF.toISOString().slice(0, 10)}`);
  console.log(`Skipped (not paid):      ${skippedNotPaid}`);
  console.log(`Skipped (has start_date):${skippedHasStartDate}`);
  console.log(`Skipped (no flag yet):   ${skippedNoFlagYet}`);
  console.log(`Ready to backfill:       ${targets.length}\n`);

  if (targets.length > 0) {
    console.log("Preview (first 5):");
    for (const t of targets.slice(0, 5)) {
      const built = buildStartDate(t.seedDate, t.tz);
      console.log(`  ${t.uid.slice(0, 12)}…  ${t.email.padEnd(38)}  → ${built.date} ${built.time} ${built.timezone}`);
    }
  }

  if (!APPLY) {
    console.log(`\nDRY RUN — re-run with --apply to write.`);
    return;
  }

  console.log(`\nApplying ${targets.length} writes…`);
  let done = 0;
  for (const t of targets) {
    const start_date = buildStartDate(t.seedDate, t.tz);
    await db.collection("Users").doc(t.uid).set({
      start_date,
      start_date_backfilled_at: FieldValue.serverTimestamp(),
      start_date_backfill_source: "rc_webhook_bug_fix",
    }, { merge: true });
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${targets.length}…`);
  }
  console.log(`Done. ${done} users updated.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
