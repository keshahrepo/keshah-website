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
const EMAIL = "nachiketgusani@gmail.com";

(async () => {
  let authUid: string | null = null;
  try {
    const u = await auth.getUserByEmail(EMAIL);
    authUid = u.uid;
    console.log(`Firebase Auth UID:  ${u.uid}`);
    console.log(`Providers:          ${u.providerData.map(p => p.providerId).join(", ") || "none"}`);
    console.log(`Created:            ${u.metadata.creationTime}`);
  } catch (e: any) {
    console.log(`Auth:               NOT FOUND (${e.message})`);
  }

  const byEmail = await db.collection("Users").where("email", "==", EMAIL).get();
  console.log(`\nFirestore docs: ${byEmail.size}`);
  for (const d of byEmail.docs) {
    const x = d.data() as any;
    console.log(`\n═══ ${d.id} ═══`);
    console.log(`  email:                              ${x.email}`);
    console.log(`  user_type:                          ${x.user_type}`);
    console.log(`  treatment_stage:                    ${x.treatment_stage}`);
    console.log(`  free_stoppage_switched_at_date:     ${x.free_stoppage_switched_at_date || "-"}`);
    console.log(`  free_maintenance_switched_at_date:  ${x.free_maintenance_switched_at_date || "-"}`);
    console.log(`  regrowth_switched_at_date:          ${x.regrowth_switched_at_date || "-"}`);
    console.log(`  extra_user_tags:                    ${JSON.stringify(x.extra_user_tags || [])}`);
    console.log(`  eligible_for_special_regrowth:      ${x.eligible_for_special_regrowth_features}`);
    console.log(`  regrowth_consultation_completed:    ${x.regrowth_consultation_completed}`);
    console.log(`  regrowth_treatment_purchased:       ${x.regrowth_treatment_purchased}`);
    console.log(`  plan:                               ${x.plan || "-"}`);
    console.log(`  razorpay_subscription_id:           ${x.razorpay_subscription_id || "-"}`);
    console.log(`  payment_provider:                   ${x.payment_provider || "-"}`);
    console.log(`  start_date:                         ${x.start_date?.date || "-"}`);
    console.log(`  paid_at:                            ${x.paid_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`  hair_loss_stoppage_reported_at:     ${x.hair_loss_stoppage_reported_at || "-"}`);
    console.log(`  userLocalTimeZone:                  ${x.userLocalTimeZone || x.user_local_time_zone || "-"}`);
  }

  if (authUid) {
    const sub = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(authUid)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (sub.ok) {
      const data: any = await sub.json();
      const ents = data?.subscriber?.entitlements || {};
      console.log(`\n═══ RevenueCat ═══`);
      if (Object.keys(ents).length === 0) {
        console.log(`  (no entitlements)`);
      } else {
        for (const [name, e] of Object.entries<any>(ents)) {
          const expires = new Date(e.expires_date).getTime();
          const active = expires > Date.now();
          console.log(`  ${name.padEnd(28)} ${active ? "ACTIVE" : "EXPIRED"} · expires ${new Date(e.expires_date).toISOString()} · product=${e.product_identifier}`);
        }
      }
    }
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
