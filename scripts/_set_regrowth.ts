// One-off: move a user to the Regrowth treatment stage by email.
//
// Sets:
//   treatment_stage = "REGROWTH"
//   regrowth_switched_at_date = today (DD/MM/YYYY)
//
// Does NOT clear existing regrowth_progress — flip-only. Idempotent.
//
// Usage: npx tsx scripts/_set_regrowth.ts <email>

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

function ddmmyyyy(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: _set_regrowth.ts <email>");
    process.exit(1);
  }

  const snap = await db.collection("Users").where("email", "==", email).limit(1).get();
  if (snap.empty) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }

  const doc = snap.docs[0];
  const before = doc.data() as Record<string, unknown>;
  console.log(`Found user: ${doc.id} (email: ${before.email})`);
  console.log(`Before:`);
  console.log(`  treatment_stage:            ${before.treatment_stage ?? "(unset)"}`);
  console.log(`  regrowth_switched_at_date:  ${before.regrowth_switched_at_date ?? "(unset)"}`);
  console.log(`  user_type:                  ${before.user_type ?? "(unset)"}`);

  const today = ddmmyyyy(new Date());
  await doc.ref.update({
    treatment_stage: "REGROWTH",
    regrowth_switched_at_date: today,
  });

  const after = (await doc.ref.get()).data() as Record<string, unknown>;
  console.log(`\nAfter:`);
  console.log(`  treatment_stage:            ${after.treatment_stage}`);
  console.log(`  regrowth_switched_at_date:  ${after.regrowth_switched_at_date}`);
  console.log(`\n✓ ${email} moved to Regrowth on ${today}.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
