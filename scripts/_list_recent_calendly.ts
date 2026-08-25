// List the last 20 Calendly bookings across the whole account so we
// can identify which email was used for a booking we know happened.

import { getFirebaseAdmin } from "../lib/firebase-admin";

const CALENDLY_API = "https://api.calendly.com";

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
  created_at: string;
}
interface Invitee {
  email: string;
  status: string;
  name?: string;
}

async function main() {
  const { db } = getFirebaseAdmin();
  const settingsSnap = await db.doc("Settings/app_general_settings").get();
  const token = settingsSnap.data()?.calendly_token as string | undefined;
  if (!token) { console.error("No calendly_token"); process.exit(1); }

  const me = await callCalendly<{ resource: { current_organization: string } }>("/users/me", token);
  const orgUri = me.resource.current_organization;

  const params = new URLSearchParams({
    organization: orgUri,
    count: "20",
    sort: "start_time:desc",
  });
  const events = await callCalendly<{ collection: ScheduledEvent[] }>(
    `/scheduled_events?${params.toString()}`,
    token
  );

  console.log(`Last ${events.collection.length} scheduled events (any invitee, any status):\n`);
  for (const evt of events.collection) {
    const eventId = evt.uri.split("/").pop();
    const inviteesResp = await callCalendly<{ collection: Invitee[] }>(
      `/scheduled_events/${eventId}/invitees`,
      token
    );
    const invitees = inviteesResp.collection
      .map((i) => `${i.email}(${i.status})`)
      .join(", ") || "(none)";
    console.log(
      `  ${evt.created_at}  status=${evt.status.padEnd(8)}  "${evt.name}"`
    );
    console.log(`    start=${evt.start_time}  invitees=${invitees}\n`);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
