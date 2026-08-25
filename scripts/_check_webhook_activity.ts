// Is the Calendly webhook working AT ALL? Query all users with any
// onboarding_call_* or regrowth_consultation_* field set — if the
// result is empty, the webhook has never successfully fired for anyone.

import { getFirebaseAdmin } from "../lib/firebase-admin";

async function main() {
  const { db } = getFirebaseAdmin();

  // Users who have booked an onboarding call (webhook wrote scheduled_start).
  const onboarding = await db
    .collection("Users")
    .where("onboarding_call_scheduled_start", "!=", null)
    .limit(20)
    .get();
  console.log(`\n── onboarding_call bookings: ${onboarding.size} users ──`);
  for (const doc of onboarding.docs) {
    const d = doc.data();
    const start = d.onboarding_call_scheduled_start?.toDate?.()?.toISOString?.() ?? "?";
    const booked = d.onboarding_call_booked_at?.toDate?.()?.toISOString?.() ?? "?";
    console.log(`  ${d.email ?? doc.id}  booked=${booked}  start=${start}`);
  }

  const regrowth = await db
    .collection("Users")
    .where("regrowth_consultation_scheduled_start", "!=", null)
    .limit(20)
    .get();
  console.log(`\n── regrowth_consultation bookings: ${regrowth.size} users ──`);
  for (const doc of regrowth.docs) {
    const d = doc.data();
    const start = d.regrowth_consultation_scheduled_start?.toDate?.()?.toISOString?.() ?? "?";
    console.log(`  ${d.email ?? doc.id}  start=${start}`);
  }

  if (onboarding.empty && regrowth.empty) {
    console.log(
      "\n⚠️  NO USERS have any Calendly webhook fields. The webhook has never fired successfully."
    );
    console.log(
      "    Either (a) not subscribed in Calendly's dashboard, or (b) subscribed but rejected every payload."
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
