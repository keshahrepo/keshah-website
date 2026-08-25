// Backfill: any user who booked a Calendly event BEFORE the webhook
// subscription was created (2026-08-17) has no onboarding_call_* /
// regrowth_consultation_* fields on their doc, so the confirmation
// card on the all-done slot never appears.
//
// This pulls the last N scheduled events from Calendly filtered by
// invitee email, resolves each event's slug → field prefix using the
// same rules as the webhook route, and writes the fields to the
// matching Firestore user doc. Idempotent — skips events already
// backfilled (matched by event URI).
//
// Usage:  set -a; source .env.local; set +a
//         # normal: match Firestore-user by email, look up Calendly by same email
//         npx tsx scripts/_backfill_calendly_booking.ts test114@test.com
//         # split: user's app account differs from the email they typed into Calendly
//         npx tsx scripts/_backfill_calendly_booking.ts test114@test.com aaditya.agrawal36@gmail.com

import { getFirebaseAdmin } from "../lib/firebase-admin";
import { Timestamp } from "firebase-admin/firestore";

const CALENDLY_API = "https://api.calendly.com";

// Same rules as app/api/hooks/calendly/route.ts — must stay in sync.
function slugFromScheduledEventName(name?: string): string | null {
  if (!name) return null;
  const lower = name.toLowerCase();
  if (lower.includes("clone") || lower.includes("onboarding"))
    return "regrowth-consultation-clone";
  if (
    lower.includes("regrowth consultation") ||
    lower.includes("regrowth-consultation")
  )
    return "regrowth-consultation";
  if (lower.includes("microneedling masterclass"))
    return "microneedling-masterclass";
  return null;
}
const SLUG_TO_PREFIX: Record<string, string> = {
  "regrowth-consultation-clone": "onboarding_call",
  "regrowth-consultation": "regrowth_consultation",
};

async function callCalendly<T>(path: string, token: string): Promise<T> {
  const resp = await fetch(`${CALENDLY_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await resp.text();
  if (!resp.ok) throw new Error(`Calendly GET ${path} → ${resp.status}: ${body.slice(0, 400)}`);
  return JSON.parse(body) as T;
}

interface ScheduledEvent {
  uri: string;
  name: string;
  status: string;
  start_time: string;
  end_time: string;
  location?: { type?: string; join_url?: string; location?: string };
  event_memberships?: Array<{ user: string }>;
}
interface Invitee {
  uri: string;
  email: string;
  status: string;
  event: string; // scheduled_event uri
}

async function main() {
  const email = (process.argv[2] || "test114@test.com").toLowerCase().trim();
  // Optional 2nd arg: the email typed into Calendly's booking form. Only
  // needed when the app account and Calendly invitee email differ (test
  // accounts, family shared devices, etc.). Defaults to `email`.
  const calendlyEmail = (process.argv[3] || email).toLowerCase().trim();

  const { db } = getFirebaseAdmin();

  const settingsSnap = await db.doc("Settings/app_general_settings").get();
  const token = settingsSnap.data()?.calendly_token as string | undefined;
  if (!token) {
    console.error("No calendly_token on Settings/app_general_settings");
    process.exit(1);
  }

  const me = await callCalendly<{ resource: { current_organization: string } }>(
    "/users/me",
    token
  );
  const orgUri = me.resource.current_organization;

  // Find the user doc first — no point fetching Calendly data if we
  // can't write it anywhere.
  const userSnap = await db
    .collection("Users")
    .where("email", "==", email)
    .limit(1)
    .get();
  if (userSnap.empty) {
    console.error(`No Firestore user for ${email}`);
    process.exit(1);
  }
  const userDoc = userSnap.docs[0];
  console.log(`Found user: ${userDoc.id}  (email=${email})\n`);

  // Calendly's `/scheduled_events?invitee_email=` filter is the
  // fastest way to narrow. Pull the last 20 (all statuses) and sort
  // by start_time desc so the most recent booking is first.
  const params = new URLSearchParams({
    organization: orgUri,
    invitee_email: calendlyEmail,
    count: "20",
    sort: "start_time:desc",
  });
  const events = await callCalendly<{ collection: ScheduledEvent[] }>(
    `/scheduled_events?${params.toString()}`,
    token
  );
  console.log(`Calendly returned ${events.collection.length} scheduled events for ${calendlyEmail}.\n`);

  const existing = userDoc.data();
  let wrote = 0;

  for (const evt of events.collection) {
    const slug = slugFromScheduledEventName(evt.name);
    const prefix = slug ? SLUG_TO_PREFIX[slug] : null;
    console.log(
      `  ${evt.status.padEnd(9)}  ${evt.start_time}  "${evt.name}"  slug=${slug ?? "-"}  prefix=${prefix ?? "-"}`
    );

    if (!prefix) continue;
    if (evt.status !== "active") {
      console.log(`    → skipped (status=${evt.status})`);
      continue;
    }

    // Idempotency: skip if this exact event URI already backfilled.
    const alreadyUri = existing[`${prefix}_calendly_event_uri`];
    if (alreadyUri === evt.uri) {
      console.log(`    → already backfilled, skipping`);
      continue;
    }

    // Pull the invitee record so we get the confirmed join_url in the
    // location.join_url field (Calendly sometimes leaves join_url null
    // on the scheduled_event and only populates it on invitee.created).
    const inviteesResp = await callCalendly<{ collection: Invitee[] }>(
      `/scheduled_events/${evt.uri.split("/").pop()}/invitees`,
      token
    );
    const invitee = inviteesResp.collection.find(
      (i) => i.email.toLowerCase() === calendlyEmail && i.status === "active"
    );
    if (!invitee) {
      console.log(`    → no matching active invitee, skipping`);
      continue;
    }

    const joinUrl =
      evt.location?.join_url ?? evt.location?.location ?? null;

    const updates: Record<string, unknown> = {
      [`${prefix}_scheduled_start`]: Timestamp.fromDate(new Date(evt.start_time)),
      [`${prefix}_booked_at`]: Timestamp.now(),
      [`${prefix}_calendly_event_uri`]: evt.uri,
    };
    if (joinUrl) updates[`${prefix}_join_url`] = joinUrl;

    await userDoc.ref.set(updates, { merge: true });
    wrote++;
    console.log(
      `    → wrote ${Object.keys(updates).length} fields (${prefix}_scheduled_start=${evt.start_time}${
        joinUrl ? `, join_url set` : ""
      })`
    );
  }

  console.log(`\n${wrote > 0 ? "✓" : "·"} Backfilled ${wrote} booking(s) for ${email}.`);
  if (wrote === 0)
    console.log(
      `  If you expected data here, check the event name matches slugFromScheduledEventName — ` +
      `it must contain "clone" or "onboarding" for onboarding_call, or "regrowth consultation" ` +
      `for regrowth_consultation.`
    );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
