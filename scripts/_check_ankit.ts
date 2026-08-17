// Usage: npx tsx scripts/_check_ankit.ts
//
// Full triage of shettyankit124@gmail.com — user says they signed up for
// yearly but have no access in the app. Checks Firestore + Firebase Auth +
// RevenueCat entitlements + recent purchase signals.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAIL = "shettyankit124@gmail.com";

async function rc(uid: string) {
  try {
    const res = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } }
    );
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return await res.json();
  } catch (e: any) {
    return { error: e.message };
  }
}

(async () => {
  console.log(`\n═══════════════ ${EMAIL} ═══════════════\n`);

  // Firebase Auth
  let authUid: string | null = null;
  try {
    const u = await auth.getUserByEmail(EMAIL);
    authUid = u.uid;
    console.log(`▸ Firebase Auth`);
    console.log(`    uid:           ${u.uid}`);
    console.log(`    providers:     ${u.providerData.map(p => p.providerId).join(", ") || "(none)"}`);
    console.log(`    created:       ${u.metadata.creationTime}`);
    console.log(`    last sign-in:  ${u.metadata.lastSignInTime}`);
    console.log(`    email verified:${u.emailVerified}`);
  } catch (e: any) {
    console.log(`▸ Firebase Auth: NOT FOUND (${e.message})`);
  }

  // Firestore docs by email
  console.log(`\n▸ Firestore Users by email`);
  const byEmail = await db.collection("Users").where("email", "==", EMAIL).get();
  console.log(`    docs found:    ${byEmail.size}`);
  for (const d of byEmail.docs) {
    const x = d.data();
    console.log(`\n    ── doc ${d.id} ──`);
    console.log(`      user_type:                       ${x.user_type || "-"}`);
    console.log(`      providerId:                      ${x.providerId || "-"}`);
    console.log(`      country / phone country:         ${x.phone_number?.country_code || "-"} / ${x.phone_number?.complete_number || "-"}`);
    console.log(`      created_at:                      ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`      start_date:                      ${JSON.stringify(x.start_date) || "-"}`);
    console.log(`      converted_at:                    ${x.converted_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`      paid_at:                         ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`      first_paid_at:                   ${x.first_paid_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`      trial_status:                    ${x.trial_status || "-"}`);
    console.log(`      subscription_plan:               ${x.subscription_plan || "-"}`);
    console.log(`      plan / razorpay_plan:            ${x.plan || x.razorpay_plan || "-"}`);
    console.log(`      payment_provider:                ${x.payment_provider || "-"}`);
    console.log(`      razorpay_subscription_id:        ${x.razorpay_subscription_id || "-"}`);
    console.log(`      razorpay_customer_id:            ${x.razorpay_customer_id || "-"}`);
    console.log(`      stripe_customer_id:              ${x.stripe_customer_id || "-"}`);
    console.log(`      pro:                             ${x.pro ?? "-"}`);
    console.log(`      open_account:                    ${x.open_account ?? "-"}`);
    console.log(`      treatment_stage:                 ${x.treatment_stage || "-"}`);
    console.log(`      extra_user_tags:                 ${JSON.stringify(x.extra_user_tags ?? [])}`);
    console.log(`      regrowth_treatment_purchased:    ${x.regrowth_treatment_purchased ?? "-"}`);
    console.log(`      scalp_health_support_purchased:  ${x.scalp_health_support_purchased ?? "-"}`);
    console.log(`      vip_treatment_purchased:         ${x.vip_treatment_purchased ?? "-"}`);
    console.log(`      selected_gender:                 ${x.selected_gender || "-"}`);
    console.log(`      is_deleted:                      ${x.is_deleted ?? "-"}`);
  }

  if (authUid) {
    const sameUidDoc = await db.collection("Users").doc(authUid).get();
    if (!sameUidDoc.exists) {
      console.log(`\n    ⚠ NO Firestore doc at Firebase Auth UID (${authUid})`);
    } else {
      console.log(`\n    ✓ Firestore doc at Auth UID exists (${authUid})`);
      if (!byEmail.docs.find(d => d.id === authUid)) {
        console.log(`    ⚠ but the email on it didn't match — possible legacy mismatch`);
      }
    }

    // RC lookup
    console.log(`\n▸ RevenueCat subscriber lookup (uid=${authUid})`);
    const sub: any = await rc(authUid);
    if (sub.error) {
      console.log(`    ✗ ${sub.error}`);
    } else {
      const ents = sub?.subscriber?.entitlements || {};
      const entNames = Object.keys(ents);
      console.log(`    entitlements:  ${entNames.length === 0 ? "(none)" : entNames.join(", ")}`);
      for (const name of entNames) {
        const e = ents[name];
        const stillActive = new Date(e.expires_date).getTime() > Date.now();
        console.log(`      • ${name}: expires ${new Date(e.expires_date).toISOString()} ${stillActive ? "(ACTIVE)" : "(EXPIRED)"} product=${e.product_identifier}`);
      }
      const subs = sub?.subscriber?.subscriptions || {};
      const subNames = Object.keys(subs);
      console.log(`    subscriptions: ${subNames.length === 0 ? "(none)" : subNames.join(", ")}`);
      for (const name of subNames) {
        const s = subs[name];
        console.log(`      • ${name}: expires ${s.expires_date} store=${s.store} period_type=${s.period_type} unsubscribe_detected_at=${s.unsubscribe_detected_at || "-"}`);
      }
      // Also check non-subscription transactions
      const nst = sub?.subscriber?.non_subscriptions || {};
      const nstNames = Object.keys(nst);
      if (nstNames.length) {
        console.log(`    non-subscriptions:`);
        for (const name of nstNames) {
          console.log(`      • ${name}: ${JSON.stringify(nst[name])}`);
        }
      }
    }

    // Try alt RC lookup via WP user id (in case purchase was made with a
    // different identifier than auth UID)
    const doc = byEmail.docs[0]?.data();
    const wpId = doc?.wp_user?.ID;
    if (wpId && wpId !== authUid) {
      console.log(`\n▸ RC lookup by wp_user.ID=${wpId}`);
      const sub2: any = await rc(String(wpId));
      if (sub2.error) {
        console.log(`    ✗ ${sub2.error}`);
      } else {
        const ents = sub2?.subscriber?.entitlements || {};
        const entNames = Object.keys(ents);
        console.log(`    entitlements:  ${entNames.length === 0 ? "(none)" : entNames.join(", ")}`);
      }
    }
  }
})();
