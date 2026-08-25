// Quick audit: is the CANCELLATION path writing to Firestore?
// Looks at Users docs touched since 2026-08-18 (build +162) and reports:
//   - How many have subscription_status set at all
//   - How many have subscription_cancelled_at
//   - Distinct subscription_status values seen
//   - How many trial starters + how many marked cancelled
// Also flags recent RC last_rc_event values so we can see what events
// actually arrived at the webhook.

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const RELEASE_CUTOFF = new Date("2026-08-18T00:00:00Z");

async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db
    .collection("Users")
    .where("created_at", ">=", Timestamp.fromDate(RELEASE_CUTOFF))
    .select("started_trial", "subscription_status", "subscription_cancelled_at", "converted_trial", "last_rc_event", "email")
    .get();

  let total = 0;
  let started = 0;
  let statusSet = 0;
  let cancelledAtSet = 0;
  let converted = 0;
  const statusCounts: Record<string, number> = {};
  const eventTypeCounts: Record<string, number> = {};

  for (const doc of snap.docs) {
    const d = doc.data();
    if (/^test\d+@test\.com$/i.test(d.email ?? "")) continue;
    total++;
    if (d.started_trial) started++;
    if (d.converted_trial) converted++;
    if (d.subscription_status) {
      statusSet++;
      statusCounts[String(d.subscription_status)] = (statusCounts[String(d.subscription_status)] ?? 0) + 1;
    }
    if (d.subscription_cancelled_at) cancelledAtSet++;
    const evt = d.last_rc_event as { type?: string } | undefined;
    if (evt?.type) eventTypeCounts[evt.type] = (eventTypeCounts[evt.type] ?? 0) + 1;
  }

  console.log(`\n=== Post-cutoff Users (created >= ${RELEASE_CUTOFF.toISOString().slice(0,10)}) ===`);
  console.log(`Total (non-test):                   ${total}`);
  console.log(`Trial started:                      ${started}`);
  console.log(`Converted trial:                    ${converted}`);
  console.log(`subscription_status set (any val):  ${statusSet}`);
  console.log(`subscription_cancelled_at set:      ${cancelledAtSet}`);
  console.log(`\nDistinct subscription_status values:`);
  for (const [k, v] of Object.entries(statusCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log(`\nRC event types seen in last_rc_event:`);
  for (const [k, v] of Object.entries(eventTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(30)} ${v}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
