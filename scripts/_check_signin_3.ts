import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const EMAILS = [
  "mojibzzzzz@gmail.com",
  "siddgarud1999@gmail.com",
  "Kdhenge@gmail.com",
];

(async () => {
  for (const email of EMAILS) {
    const lower = email.toLowerCase();
    console.log(`\n═══ ${email} ═══`);

    // Firebase Auth lookup (case-insensitive both ways)
    let authUid: string | null = null;
    for (const tryEmail of [email, lower]) {
      try {
        const u = await auth.getUserByEmail(tryEmail);
        authUid = u.uid;
        console.log(`  ✓ Firebase Auth found via "${tryEmail}"`);
        console.log(`    UID:           ${u.uid}`);
        console.log(`    Email:         ${u.email}`);
        console.log(`    Verified:      ${u.emailVerified}`);
        console.log(`    Disabled:      ${u.disabled}`);
        console.log(`    Providers:     ${u.providerData.map(p => `${p.providerId}(${p.email || "-"})`).join(", ") || "none"}`);
        console.log(`    Created:       ${u.metadata.creationTime}`);
        console.log(`    Last sign-in:  ${u.metadata.lastSignInTime}`);
        break;
      } catch (e: any) {
        if (tryEmail === lower) {
          console.log(`  ✗ Firebase Auth NOT FOUND for "${email}" or "${lower}" (${e.code || e.message})`);
        }
      }
    }

    // Firestore Users docs by email (both cases)
    const seen = new Set<string>();
    for (const tryEmail of [email, lower]) {
      const byEmail = await db.collection("Users").where("email", "==", tryEmail).get();
      for (const d of byEmail.docs) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        const x = d.data();
        console.log(`  Firestore doc ${d.id} (email=${x.email}):`);
        console.log(`    providerId:        ${x.providerId || "-"}`);
        console.log(`    signup_source:     ${x.signup_source || "-"}`);
        console.log(`    trial_status:      ${x.trial_status || "-"}`);
        console.log(`    paid_at:           ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
        console.log(`    payment_provider:  ${x.payment_provider || "-"}`);
        console.log(`    rc_customer_id:    ${x.rc_customer_id || "-"}`);
        console.log(`    treatment_stage:   ${x.treatment_stage || "-"}`);
        console.log(`    start_date:        ${x.start_date?.toDate?.()?.toISOString() || x.start_date || "-"}`);
        console.log(`    last_active:       ${x.last_active?.toDate?.()?.toISOString() || "-"}`);
        console.log(`    created_at:        ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
      }
    }
    if (seen.size === 0) console.log(`  Firestore: 0 docs by email`);

    // Funnel events for this email's session — try by sessionId via leads if any
    // Funnel has no email; check for recent leads (saved-profile)
    const leads = await db.collection("Leads").where("email", "==", lower).limit(5).get();
    if (leads.size > 0) {
      console.log(`  Leads collection: ${leads.size} matching`);
      for (const d of leads.docs) {
        const x = d.data();
        console.log(`    lead ${d.id}: source=${x.source || "-"} created=${x.created_at?.toDate?.()?.toISOString() || "-"}`);
      }
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
