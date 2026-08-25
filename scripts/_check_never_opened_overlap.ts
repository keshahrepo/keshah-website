// Which trial-starters never opened Day 1, and how many of them cancelled?
// Answers "is the never-opened bucket = buyer's regret, or = onboarding gap".

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select(
      "started_trial",
      "progress",
      "subscription_status",
      "email",
    )
    .get();

  let total = 0;
  let neverOpened = 0;
  let neverOpenedAndCancelled = 0;
  let neverOpenedAndActive = 0;
  const activeNeverOpenedIds: string[] = [];

  for (const doc of snap.docs) {
    const d = doc.data();
    if (/^test\d+@test\.com$/i.test(d.email ?? "")) continue;
    if (!d.started_trial) continue;
    total++;

    const progress = (d.progress as Record<string, Array<unknown> | undefined> | undefined) ?? {};
    const day1 = progress["day1"];
    const opened = Array.isArray(day1) && day1.length > 0;
    if (opened) continue;

    neverOpened++;
    const cancelled = d.subscription_status === "cancelled";
    if (cancelled) neverOpenedAndCancelled++;
    else {
      neverOpenedAndActive++;
      activeNeverOpenedIds.push(doc.id);
    }
  }

  console.log(`\n=== Trial-starters analysis ===`);
  console.log(`Total trials started:           ${total}`);
  console.log(`Never opened Day 1:             ${neverOpened}`);
  console.log(`  ...also cancelled:            ${neverOpenedAndCancelled}   ← buyer's regret`);
  console.log(`  ...still active:              ${neverOpenedAndActive}   ← onboarding gap`);
  if (activeNeverOpenedIds.length > 0) {
    console.log(`\nActive users who never opened Day 1 (potential intervention targets):`);
    for (const id of activeNeverOpenedIds) console.log(`  ${id}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
