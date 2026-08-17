import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAILS = [
  "adityathaker01@gmail.com",
  "ravikiran.576@gmail.com",
  "nshashidhar67@gmail.com",
];

async function rc(uid: string) {
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

(async () => {
  for (const email of EMAILS) {
    console.log(`\n═══ ${email} ═══`);

    // Firebase Auth lookup
    let authUid: string | null = null;
    try {
      const u = await auth.getUserByEmail(email);
      authUid = u.uid;
      console.log(`  Firebase Auth UID: ${u.uid}`);
      console.log(`  Providers:         ${u.providerData.map(p => p.providerId).join(", ") || "none"}`);
      console.log(`  Created:           ${u.metadata.creationTime}`);
      console.log(`  Last sign-in:      ${u.metadata.lastSignInTime}`);
    } catch (e: any) {
      console.log(`  Firebase Auth:     NOT FOUND (${e.message})`);
    }

    // Firestore Users doc by email
    const byEmail = await db.collection("Users").where("email", "==", email).get();
    console.log(`  Firestore docs by email=${email}: ${byEmail.size}`);
    for (const d of byEmail.docs) {
      const x = d.data();
      console.log(`    doc ${d.id}:`);
      console.log(`      providerId:          ${x.providerId || "-"}`);
      console.log(`      user_type:           ${x.user_type || "-"}`);
      console.log(`      start_date:          ${x.start_date ? "set" : "-"}`);
      console.log(`      extra_user_tags:     ${JSON.stringify(x.extra_user_tags)}`);
      console.log(`      razorpay_sub:        ${x.razorpay_subscription_id || "-"}`);
      console.log(`      razorpay_plan:       ${x.plan || x.razorpay_plan || "-"}`);
      console.log(`      payment_provider:    ${x.payment_provider || "-"}`);
      console.log(`      trial_status:        ${x.trial_status || "-"}`);
      console.log(`      paid_at:             ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
      console.log(`      signup_source:       ${x.signup_source || "-"}`);
      console.log(`      phone_number:        ${x.phone_number?.complete_number || "-"}`);
    }

    // If Firestore doc exists at same UID as Auth
    if (authUid) {
      const sameUidDoc = await db.collection("Users").doc(authUid).get();
      if (!sameUidDoc.exists) {
        console.log(`  ⚠️  NO Firestore doc at Firebase Auth UID (${authUid})`);
      } else if (!byEmail.docs.find(d => d.id === authUid)) {
        console.log(`  ⚠️  Firestore doc at Auth UID exists but email didn't match — possible mismatch`);
      }

      // RC entitlement
      const sub: any = await rc(authUid);
      const ent = sub?.subscriber?.entitlements?.stoppage_treatment;
      if (!ent) {
        console.log(`  RC entitlement:    NONE`);
      } else {
        const expires = new Date(ent.expires_date).toISOString();
        const stillActive = new Date(ent.expires_date).getTime() > Date.now();
        console.log(`  RC entitlement:    ${stillActive ? "ACTIVE" : "EXPIRED"} · expires ${expires}`);
        console.log(`  RC product_id:     ${ent.product_identifier}`);
      }
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
