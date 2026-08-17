// Backfill microneedling_masterclass_join_url + _event_start_time on
// users who booked before the app started fetching event details from
// Calendly at booking time.
//
// For each booked user with a calendly_event_uri but no join_url:
//   GET the scheduled_event from Calendly
//   Extract location.join_url + start_time
//   Write both to the user doc
//
// Usage:
//   set -a && source .env.local && set +a
//   npx tsx scripts/_backfill_masterclass_details.ts         # dry-run
//   APPLY=1 npx tsx scripts/_backfill_masterclass_details.ts # apply
//   EMAIL=test93@test.com APPLY=1 …                           # single user

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");
const SINGLE_EMAIL = process.env.EMAIL;

interface CalendlyEventResponse {
  resource: {
    start_time: string;
    end_time: string;
    location?: { type?: string; join_url?: string; status?: string };
  };
}

async function fetchScheduledEvent(
  eventUri: string,
  token: string
): Promise<CalendlyEventResponse | null> {
  const res = await fetch(eventUri, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.log(`    ✗ Calendly ${res.status} ${res.statusText}`);
    return null;
  }
  return (await res.json()) as CalendlyEventResponse;
}

(async () => {
  console.log(
    `\n=== Masterclass backfill — ${APPLY ? "APPLY" : "DRY RUN"} ===\n`
  );

  // Grab calendly token from app settings.
  const settingsSnap = await db.doc("Settings/app_general_settings").get();
  const token = settingsSnap.data()?.calendly_token as string | undefined;
  if (!token) {
    console.error("ERR: no calendly_token on Settings/app_general_settings");
    process.exit(1);
  }
  console.log(`Using calendly_token (${token.slice(0, 8)}…)\n`);

  // Collect eligible users.
  let usersSnap;
  if (SINGLE_EMAIL) {
    usersSnap = await db
      .collection("Users")
      .where("email", "==", SINGLE_EMAIL)
      .limit(1)
      .get();
  } else {
    usersSnap = await db
      .collection("Users")
      .where("microneedling_masterclass_calendly_event_uri", "!=", null)
      .get();
  }
  console.log(`Candidates: ${usersSnap.size}\n`);

  let updated = 0,
    alreadyDone = 0,
    failed = 0,
    skipped = 0;

  for (const doc of usersSnap.docs) {
    const x = doc.data();
    const eventUri = x.microneedling_masterclass_calendly_event_uri as
      | string
      | undefined;
    if (!eventUri) {
      skipped++;
      continue;
    }
    if (
      x.microneedling_masterclass_join_url &&
      x.microneedling_masterclass_event_start_time
    ) {
      alreadyDone++;
      continue;
    }

    console.log(`  ${x.email || doc.id}`);
    console.log(`    event: ${eventUri}`);

    const event = await fetchScheduledEvent(eventUri, token);
    if (!event) {
      failed++;
      continue;
    }
    const joinUrl = event.resource.location?.join_url;
    const startTime = event.resource.start_time;
    console.log(`    start: ${startTime}`);
    console.log(`    join:  ${joinUrl ?? "(none in location)"}`);

    if (!APPLY) continue;

    const updates: Record<string, unknown> = {
      microneedling_masterclass_event_start_time: startTime,
    };
    if (joinUrl) {
      updates.microneedling_masterclass_join_url = joinUrl;
    }
    await db.collection("Users").doc(doc.id).update(updates);
    updated++;
  }

  console.log(`\nDone.`);
  console.log(`  updated:      ${updated}`);
  console.log(`  already done: ${alreadyDone}`);
  console.log(`  failed:       ${failed}`);
  console.log(`  skipped:      ${skipped}`);
  process.exit(0);
})().catch((e: Error) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
