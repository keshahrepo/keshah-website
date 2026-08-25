// Diagnose: why isn't Aadi's booked onboarding call showing on
// the all-done slot? Reads his user doc directly and prints every
// field the OnboardingCallConfirmationCard depends on.

import { getFirebaseAdmin } from "../lib/firebase-admin";

const EMAIL = "test114@test.com";

async function main() {
  const { db } = getFirebaseAdmin();
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) {
    console.log(`No user found for ${EMAIL}`);
    process.exit(1);
  }
  const doc = snap.docs[0];
  const d = doc.data();
  console.log(`Found user: ${doc.id}`);
  console.log(`user_type: ${d.user_type}`);
  console.log(`\n── OnboardingCallConfirmationCard inputs ──`);
  console.log(`onboarding_call_scheduled_start: ${
    d.onboarding_call_scheduled_start
      ? d.onboarding_call_scheduled_start.toDate?.().toISOString?.() ?? JSON.stringify(d.onboarding_call_scheduled_start)
      : "MISSING (this is why card is hidden)"
  }`);
  console.log(`onboarding_call_join_url: ${d.onboarding_call_join_url ?? "MISSING"}`);
  console.log(`onboarding_call_booked_at: ${
    d.onboarding_call_booked_at
      ? d.onboarding_call_booked_at.toDate?.().toISOString?.() ?? JSON.stringify(d.onboarding_call_booked_at)
      : "MISSING"
  }`);
  console.log(`onboarding_call_calendly_event_uri: ${d.onboarding_call_calendly_event_uri ?? "MISSING"}`);

  console.log(`\n── Related Calendly fields (regrowth consultation, for comparison) ──`);
  console.log(`regrowth_consultation_scheduled_start: ${d.regrowth_consultation_scheduled_start ? "set" : "-"}`);
  console.log(`regrowth_consultation_join_url: ${d.regrowth_consultation_join_url ?? "-"}`);

  // If the field is missing, the webhook probably never fired or
  // fired but couldn't resolve this user. Print recent Calendly-adjacent
  // fields so we can rule things out.
  console.log(`\n── Anything Calendly-shaped on this doc ──`);
  for (const [k, v] of Object.entries(d)) {
    if (k.toLowerCase().includes("calendly") || k.toLowerCase().includes("call")) {
      const val = v as unknown;
      const display = val && typeof (val as { toDate?: () => Date }).toDate === "function"
        ? (val as { toDate: () => Date }).toDate().toISOString()
        : typeof val === "object"
          ? JSON.stringify(val).slice(0, 80)
          : String(val);
      console.log(`  ${k} = ${display}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
