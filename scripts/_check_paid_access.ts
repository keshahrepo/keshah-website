// Diagnoses why a paid user can't access the app. Looks up user docs by
// email, checks for ALL paid-access signals (RevenueCat entitlements via
// stored data, Razorpay subscription, Stripe customer, trial status,
// user_type) so we can see where the mismatch is.
//
// Usage: npx tsx scripts/_check_paid_access.ts <email> [<email2> ...]

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function inspect(email: string) {
  const e = email.trim().toLowerCase();
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`  ${e}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  const byEmail = await db.collection("Users").where("email", "==", e).get();
  const byWp = await db.collection("Users").where("wp_user.user_email", "==", e).get();
  const all = new Map<string, FirebaseFirestore.DocumentData>();
  byEmail.docs.forEach((d) => all.set(d.id, d.data()));
  byWp.docs.forEach((d) => { if (!all.has(d.id)) all.set(d.id, d.data()); });

  if (all.size === 0) {
    console.log("  ❌ NO USER DOC FOUND. Check the Trials collection by email instead.\n");
    const trials = await db.collection("Trials").where("email", "==", e).get();
    console.log(`  Trials collection: ${trials.size} doc(s)`);
    trials.docs.forEach((d, i) => {
      const x = d.data();
      console.log(`  [trial ${i}] ${d.id}`);
      console.log(`    status:           ${x.status || "-"}`);
      console.log(`    plan:             ${x.plan || "-"}`);
      console.log(`    razorpay_sub:     ${x.razorpay_subscription_id || "-"}`);
      console.log(`    stripe_session:   ${x.stripe_session_id || "-"}`);
      console.log(`    created_at:       ${x.created_at?.toDate?.()?.toISOString() || x.created_at || "-"}`);
      console.log(`    paid_at:          ${x.paid_at?.toDate?.()?.toISOString() || x.paid_at || "-"}`);
    });
    return;
  }

  console.log(`  ${all.size} user doc(s) found\n`);
  let i = 0;
  for (const [uid, x] of all) {
    console.log(`  [${i}] UID: ${uid}`);
    console.log(`      providerId:                 ${x.providerId || "-"}`);
    console.log(`      user_type:                  ${x.user_type || "-"}`);
    console.log(`      open_account:               ${x.open_account ?? "-"}`);
    console.log(`      pro:                        ${x.pro ?? "-"}`);
    console.log(`      treatment_stage:            ${x.treatment_stage || "-"}`);
    console.log(`      start_date:                 ${JSON.stringify(x.start_date) || "-"}`);
    console.log(`      created_at:                 ${x.created_at?.toDate?.()?.toISOString() || x.created_at || "-"}`);
    console.log(`      paid_at:                    ${x.paid_at?.toDate?.()?.toISOString() || x.paid_at || "-"}`);
    console.log(`      trial_status:               ${x.trial_status || "-"}`);
    console.log(`      plan:                       ${x.plan || x.razorpay_plan || "-"}`);
    console.log(`      razorpay_subscription_id:   ${x.razorpay_subscription_id || "-"}`);
    console.log(`      razorpay_customer_id:       ${x.razorpay_customer_id || "-"}`);
    console.log(`      stripe_customer_id:         ${x.stripe_customer_id || "-"}`);
    console.log(`      stripe_session_id:          ${x.stripe_session_id || "-"}`);
    console.log(`      revenuecat_app_user_id:     ${x.revenuecat_app_user_id || "-"}`);
    console.log(`      regrowth_treatment_purchased: ${x.regrowth_treatment_purchased ?? "-"}`);
    console.log(`      user_local_time_zone:       ${x.user_local_time_zone || "-"}`);
    console.log(`      wp_user.ID:                 ${x.wp_user?.ID || "-"}`);
    console.log(`      wp_user.email:              ${x.wp_user?.user_email || "-"}`);
    console.log(`      qr_scanned:                 ${x.qr_scanned ?? "-"}`);
    console.log(`      is_deleted:                 ${x.is_deleted ?? "-"}`);
    console.log(``);
    i++;
  }

  // Cross-reference Trials collection by email
  const trials = await db.collection("Trials").where("email", "==", e).get();
  console.log(`  Trials collection: ${trials.size} doc(s)`);
  trials.docs.forEach((d, i) => {
    const x = d.data();
    console.log(`  [trial ${i}] ${d.id}`);
    console.log(`      status:           ${x.status || "-"}`);
    console.log(`      plan:             ${x.plan || "-"}`);
    console.log(`      razorpay_sub:     ${x.razorpay_subscription_id || "-"}`);
    console.log(`      stripe_session:   ${x.stripe_session_id || "-"}`);
    console.log(`      created_at:       ${x.created_at?.toDate?.()?.toISOString() || x.created_at || "-"}`);
    console.log(`      paid_at:          ${x.paid_at?.toDate?.()?.toISOString() || x.paid_at || "-"}`);
  });
}

(async () => {
  const emails = process.argv.slice(2);
  if (emails.length === 0) {
    console.error("Usage: _check_paid_access.ts <email> [<email2> ...]");
    process.exit(1);
  }
  for (const e of emails) {
    await inspect(e);
  }
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
