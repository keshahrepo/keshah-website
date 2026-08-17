import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();

const EMAIL = process.argv[2] ?? "5r9bd5t44d@privaterelay.appleid.com";
const PROD_RC_KEY = "sk_vpNXbCCTXbuJaBvpGpFeYzRefSghx";

(async () => {
  console.log(`\n═══ ${EMAIL} ═══\n`);

  let uid: string | null = null;
  try {
    const u = await auth.getUserByEmail(EMAIL);
    uid = u.uid;
    console.log(`Auth UID:          ${u.uid}`);
    console.log(`Created:           ${u.metadata.creationTime}`);
    console.log(`Last sign-in:      ${u.metadata.lastSignInTime}`);
    console.log(`Providers:         ${u.providerData.map(p => `${p.providerId}(${p.email || "-"})`).join(", ")}`);
    console.log(`Email verified:    ${u.emailVerified}`);
    console.log(`Disabled:          ${u.disabled}`);
  } catch (e: any) {
    console.log(`Auth: NOT FOUND (${e.code || e.message})`);
  }

  if (!uid) {
    const q = await db.collection("Users").where("email", "==", EMAIL).limit(3).get();
    if (!q.empty) {
      uid = q.docs[0].id;
      console.log(`Found by Firestore email: ${uid}`);
    } else {
      console.log("No Firestore doc by email either. User does not exist.");
      process.exit(0);
    }
  }

  const doc = await db.collection("Users").doc(uid).get();
  if (!doc.exists) {
    console.log(`No Firestore doc at ${uid}`);
    process.exit(0);
  }
  const x = doc.data() as any;

  console.log(`\n--- Treatment ---`);
  console.log(`treatment_stage:           ${x.treatment_stage ?? "-"}`);
  console.log(`user_type:                 ${x.user_type ?? "-"}`);
  console.log(`gender:                    ${x.selected_gender ?? "-"}`);
  console.log(`hair_goal:                 ${x.hair_goal ?? "-"}`);
  console.log(`hair_loss_location:        ${x.hair_loss_location ?? "-"}`);
  console.log(`extra_user_tags:           ${JSON.stringify(x.extra_user_tags ?? [])}`);
  console.log(`start_date:                ${x.start_date?.toDate?.()?.toISOString?.() ?? x.start_date ?? "-"}`);

  console.log(`\n--- Payment ---`);
  console.log(`paid_at:                   ${x.paid_at?.toDate?.()?.toISOString?.() ?? "-"}`);
  console.log(`payment_provider:          ${x.payment_provider ?? "-"}`);
  console.log(`razorpay_subscription_id:  ${x.razorpay_subscription_id ?? "-"}`);
  console.log(`razorpay_plan:             ${x.razorpay_plan ?? "-"}`);
  console.log(`plan:                      ${x.plan ?? "-"}`);
  console.log(`signup_source:             ${x.signup_source ?? "-"}`);
  console.log(`trial_status:              ${x.trial_status ?? "-"}`);
  console.log(`trial_started_at:          ${x.trial_started_at?.toDate?.()?.toISOString?.() ?? "-"}`);
  console.log(`trial_ends_at:             ${x.trial_ends_at?.toDate?.()?.toISOString?.() ?? "-"}`);

  console.log(`\n--- Regrowth (if applicable) ---`);
  console.log(`regrowth_treatment_purchased: ${x.regrowth_treatment_purchased ?? false}`);
  console.log(`regrowth_session_day:         ${x.regrowth_session_day ?? "-"}`);
  console.log(`regrowth_switched_at_date:    ${x.regrowth_switched_at_date ?? "-"}`);

  console.log(`\n--- Activity ---`);
  console.log(`created_at:                ${x.created_at?.toDate?.()?.toISOString?.() ?? "-"}`);
  console.log(`last_active:               ${x.last_active?.toDate?.()?.toISOString?.() ?? "-"}`);
  console.log(`nurture_started_at:        ${x.nurture_started_at?.toDate?.()?.toISOString?.() ?? "-"}`);

  // RC entitlement
  try {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${uid}`, {
      headers: { Authorization: `Bearer ${PROD_RC_KEY}` },
    });
    if (r.ok) {
      const j: any = await r.json();
      const ents = j?.subscriber?.entitlements ?? {};
      const subs = j?.subscriber?.subscriptions ?? {};
      console.log(`\n--- RC ---`);
      const entKeys = Object.keys(ents);
      if (entKeys.length === 0) {
        console.log(`entitlements:              NONE`);
      } else {
        for (const k of entKeys) {
          const e = ents[k];
          const active = new Date(e.expires_date).getTime() > Date.now();
          console.log(`entitlement ${k}: ${active ? "ACTIVE" : "EXPIRED"} expires=${e.expires_date} product=${e.product_identifier}`);
        }
      }
      console.log(`subscriptions:             ${Object.keys(subs).length}`);
      for (const [pid, s] of Object.entries(subs) as any) {
        console.log(`  ${pid}: store=${s.store} purchased=${s.purchase_date} expires=${s.expires_date} unsub=${s.unsubscribe_detected_at ?? "-"}`);
      }
    } else {
      console.log(`\nRC: ${r.status}`);
    }
  } catch (e: any) {
    console.log(`\nRC error: ${e.message}`);
  }

  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
