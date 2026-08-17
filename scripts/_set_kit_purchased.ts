// One-off: flip a user's `regrowth_treatment_purchased` to true for testing
// the post-kit-purchase UX without going through Stripe/Razorpay.
//
// Usage: npx tsx scripts/_set_kit_purchased.ts <email>

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const email = (process.argv[2] ?? "").trim().toLowerCase();
  if (!email) {
    console.error("Usage: _set_kit_purchased.ts <email>");
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
  console.log(`  regrowth_treatment_purchased:  ${before.regrowth_treatment_purchased ?? "(unset)"}`);
  console.log(`  regrowth_kit_payment_provider: ${before.regrowth_kit_payment_provider ?? "(unset)"}`);

  await doc.ref.update({
    regrowth_treatment_purchased: true,
    regrowth_kit_paid_at: FieldValue.serverTimestamp(),
    regrowth_kit_payment_provider: "test_admin_script",
    modified_at: FieldValue.serverTimestamp(),
  });

  const after = (await doc.ref.get()).data() as Record<string, unknown>;
  console.log(`\nAfter:`);
  console.log(`  regrowth_treatment_purchased:  ${after.regrowth_treatment_purchased}`);
  console.log(`  regrowth_kit_payment_provider: ${after.regrowth_kit_payment_provider}`);
  console.log(`\n✓ ${email} marked as kit-purchased.`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
