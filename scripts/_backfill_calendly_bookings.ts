// One-off backfill: for every careers_applications record stuck in
// "awaiting_booking", query Calendly for scheduled events matching the
// invitee email, and if found, flip to "booked" + populate the
// calendly_* fields the webhook would have written.
//
// Usage:
//   set -a && source .env.local && set +a
//   CALENDLY_PAT='<token>' npx tsx scripts/_backfill_calendly_bookings.ts [--dry]

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const CALENDLY_PAT = process.env.CALENDLY_PAT || "";
const USER_URI = "https://api.calendly.com/users/42042a9c-2d4c-47aa-9486-7f7b8360f6d7";
const DRY = process.argv.includes("--dry");

if (!CALENDLY_PAT) {
  console.error("Missing CALENDLY_PAT env var.");
  process.exit(1);
}

type CalendlyEvent = {
  uri: string;
  start_time: string;
  end_time: string;
  status: string;
  location?: { type?: string; join_url?: string };
};

type CalendlyInvitee = {
  uri: string;
  email: string;
  name: string;
  status: string;
  cancel_url?: string;
  reschedule_url?: string;
  event: string;
  tracking?: { utm_source?: string };
};

async function fetchScheduledEventsForEmail(email: string): Promise<Array<{ event: CalendlyEvent; invitee: CalendlyInvitee }>> {
  const url = `https://api.calendly.com/scheduled_events?user=${encodeURIComponent(USER_URI)}&invitee_email=${encodeURIComponent(email)}&status=active&count=5`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${CALENDLY_PAT}` } });
  if (!res.ok) {
    console.warn(`  [!] scheduled_events fetch ${res.status} for ${email}`);
    return [];
  }
  const body = (await res.json()) as { collection: CalendlyEvent[] };
  if (body.collection.length === 0) return [];

  // For each event, fetch invitees to confirm the match and grab utm_source + urls.
  const out: Array<{ event: CalendlyEvent; invitee: CalendlyInvitee }> = [];
  for (const ev of body.collection) {
    const invRes = await fetch(`${ev.uri}/invitees?email=${encodeURIComponent(email)}`, {
      headers: { Authorization: `Bearer ${CALENDLY_PAT}` },
    });
    if (!invRes.ok) continue;
    const invBody = (await invRes.json()) as { collection: CalendlyInvitee[] };
    for (const inv of invBody.collection) out.push({ event: ev, invitee: inv });
  }
  return out;
}

(async () => {
  console.log(`\nBackfill mode: ${DRY ? "DRY RUN" : "LIVE"}\n`);

  // Pull everything awaiting_booking.
  const snap = await db
    .collection("careers_applications")
    .where("status", "==", "awaiting_booking")
    .get();

  console.log(`Found ${snap.size} records in awaiting_booking.\n`);

  let matched = 0;
  let notFound = 0;
  let noEmail = 0;
  let errors = 0;

  for (const doc of snap.docs) {
    const data = doc.data() as { email?: string; full_name?: string };
    const email = (data.email ?? "").trim().toLowerCase();
    if (!email) { noEmail++; continue; }

    try {
      const hits = await fetchScheduledEventsForEmail(email);
      if (hits.length === 0) {
        console.log(`  —  no Calendly booking:  ${doc.id}  ${email}  (${data.full_name ?? "?"})`);
        notFound++;
        continue;
      }
      // Take the most future-dated event.
      const sorted = hits.sort(
        (a, b) => new Date(b.event.start_time).getTime() - new Date(a.event.start_time).getTime(),
      );
      const { event, invitee } = sorted[0];
      console.log(`  ✓  BOOKED:  ${doc.id}  ${email}  →  ${event.start_time}`);
      matched++;

      if (!DRY) {
        await db.collection("careers_applications").doc(doc.id).set(
          {
            status: "booked",
            booked_at: FieldValue.serverTimestamp(),
            calendly_event_start_time: event.start_time,
            calendly_event_uri: event.uri,
            calendly_join_url: event.location?.join_url ?? null,
            calendly_reschedule_url: invitee.reschedule_url ?? null,
            calendly_cancel_url: invitee.cancel_url ?? null,
            last_updated_at: FieldValue.serverTimestamp(),
            backfilled_from_calendly_at: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
    } catch (e) {
      errors++;
      console.warn(`  [!] error on ${doc.id} ${email}: ${(e as Error).message}`);
    }
  }

  console.log(`\n═══ Summary ═══`);
  console.log(`  matched / booked:     ${matched}`);
  console.log(`  no Calendly booking:  ${notFound}`);
  console.log(`  no email on record:   ${noEmail}`);
  console.log(`  errors:               ${errors}`);
  process.exit(0);
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
