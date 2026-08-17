// Deep dive on wjrxrmczv5@privaterelay.appleid.com:
//   - Firebase Auth
//   - Firestore Users doc (full)
//   - RC subscriber state (entitlements, subscriptions, history)
//   - Support thread (support/{uid}/messages)
//   - Progress + aftercare summary
//
// Usage: npx tsx scripts/_check_relay_user.ts

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

const EMAIL = "wjrxrmczv5@privaterelay.appleid.com";

function ts(t: any): string {
  try { return t?.toDate?.()?.toISOString() ?? "-"; } catch { return "-"; }
}

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
  console.log(`\n═══════════ ${EMAIL} ═══════════\n`);

  // ── Firebase Auth ────────────────────────────────────────────
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

  // ── Firestore User doc ───────────────────────────────────────
  const byEmail = await db.collection("Users").where("email", "==", EMAIL).get();
  console.log(`\n▸ Firestore Users by email: ${byEmail.size}`);
  for (const d of byEmail.docs) {
    const x: any = d.data();
    console.log(`\n  ── doc ${d.id} ──`);
    console.log(`    user_type:                       ${x.user_type || "-"}`);
    console.log(`    providerId:                      ${x.providerId || "-"}`);
    console.log(`    first_name / display:            ${x.first_name || x.wp_user?.display_name || "-"}`);
    console.log(`    phone:                           ${x.phone_number?.complete_number || "-"} (${x.phone_number?.country_code || "-"})`);
    console.log(`    selected_gender:                 ${x.selected_gender || "-"}`);
    console.log(`    created_at:                      ${ts(x.created_at)}`);
    console.log(`    modified_at:                     ${ts(x.modified_at)}`);
    console.log(`    start_date:                      ${JSON.stringify(x.start_date) || "-"}`);
    console.log(`    converted_at:                    ${ts(x.converted_at)}`);
    console.log(`    paid_at:                         ${ts(x.paid_at)}`);
    console.log(`    first_paid_at:                   ${ts(x.first_paid_at)}`);
    console.log(`    trial_status:                    ${x.trial_status || "-"}`);
    console.log(`    subscription_plan:               ${x.subscription_plan || "-"}`);
    console.log(`    treatment_stage:                 ${x.treatment_stage || "-"}`);
    console.log(`    free_stoppage_switched_at:       ${x.free_stoppage_switched_at_date || "-"}`);
    console.log(`    free_stoppage_ext_switched:      ${x.free_stoppage_ext_switched_at_date || "-"}`);
    console.log(`    free_maintenance_switched:       ${x.free_maintenance_switched_at_date || "-"}`);
    console.log(`    regrowth_switched_at:            ${x.regrowth_switched_at_date || "-"}`);
    console.log(`    hair_loss_stoppage_at:           ${ts(x.hair_loss_stoppage_reported_at)}`);
    console.log(`    stabilization_confirmed:         ${x.stabilization_confirmed ?? "-"}`);
    console.log(`    extra_user_tags:                 ${JSON.stringify(x.extra_user_tags ?? [])}`);
    console.log(`    open_account:                    ${x.open_account ?? "-"}`);
    console.log(`    pro:                             ${x.pro ?? "-"}`);
    console.log(`    regrowth_kit_purchased:          ${x.regrowth_treatment_purchased ?? "-"}`);
    console.log(`    scalp_kit_purchased:             ${x.scalp_health_support_purchased ?? "-"}`);
    console.log(`    vip_treatment_purchased:         ${x.vip_treatment_purchased ?? "-"}`);
    console.log(`    referral_source:                 ${x.referral_source || "-"}`);
    console.log(`    hair_loss_location:              ${x.hair_loss_location || "-"}`);
    console.log(`    hair_goal:                       ${x.hair_goal || "-"}`);
    console.log(`    treatments_tried:                ${JSON.stringify(x.treatments_tried || "-")}`);
    console.log(`    commitment_answer:               ${x.commitment_answer || "-"}`);
    console.log(`    qr_scanned:                      ${x.qr_scanned ?? "-"}`);
    console.log(`    starter_photos_submitted:        ${x.starter_photos_submit_submitted_once ?? "-"}`);
    console.log(`    razorpay_subscription_id:        ${x.razorpay_subscription_id || "-"}`);
    console.log(`    razorpay_customer_id:            ${x.razorpay_customer_id || "-"}`);
    console.log(`    stripe_customer_id:              ${x.stripe_customer_id || "-"}`);
    console.log(`    progress days:                   ${x.progress ? Object.keys(x.progress).length : "-"}`);
    console.log(`    aftercare_progress days:         ${x.aftercare_progress ? Object.keys(x.aftercare_progress).length : "-"}`);
    console.log(`    regrowth_progress days:          ${x.regrowth_progress ? Object.keys(x.regrowth_progress).length : "-"}`);
    console.log(`    is_deleted:                      ${x.is_deleted ?? "-"}`);
    console.log(`    user_local_time_zone:            ${x.user_local_time_zone || x.userLocalTimeZone || "-"}`);
    console.log(`    onboarding_flow_version:         ${x.onboarding_flow_version || "-"}`);
    console.log(`    conversion_source:               ${x.conversion_source || "-"}`);
    console.log(`    nurture_started_at:              ${ts(x.nurture_started_at)}`);
    console.log(`    nurture_completed:               ${x.nurture_completed ?? "-"}`);
    console.log(`    support_needs:                   ${JSON.stringify(x.support_needs || "-")}`);
  }

  if (!authUid && !byEmail.empty) authUid = byEmail.docs[0].id;

  // ── RC subscriber ────────────────────────────────────────────
  if (authUid) {
    console.log(`\n▸ RevenueCat subscriber (uid=${authUid})`);
    const sub: any = await rc(authUid);
    if (sub.error) {
      console.log(`    ✗ ${sub.error}`);
    } else {
      const ents = sub?.subscriber?.entitlements || {};
      for (const [name, e] of Object.entries(ents) as any) {
        const exp = new Date(e.expires_date);
        const active = exp.getTime() > Date.now();
        console.log(`    entitlement ${name}: ${active ? "ACTIVE" : "EXPIRED"} expires=${exp.toISOString()} product=${e.product_identifier}`);
      }
      if (Object.keys(ents).length === 0) console.log(`    entitlements: (none)`);
      const subs = sub?.subscriber?.subscriptions || {};
      for (const [name, s] of Object.entries(subs) as any) {
        console.log(`    subscription ${name}: expires=${s.expires_date} store=${s.store} period=${s.period_type} unsubscribed_at=${s.unsubscribe_detected_at || "-"} billing_issues=${s.billing_issues_detected_at || "-"}`);
      }
      const nst = sub?.subscriber?.non_subscriptions || {};
      for (const [name, arr] of Object.entries(nst) as any) {
        console.log(`    non-subscription ${name}: ${(arr as any[]).length} purchases`);
      }
      console.log(`    first_seen: ${sub?.subscriber?.first_seen}`);
      console.log(`    last_seen:  ${sub?.subscriber?.last_seen}`);
      console.log(`    original_app_user_id: ${sub?.subscriber?.original_app_user_id || "-"}`);
    }
  }

  // ── Support messages ─────────────────────────────────────────
  if (authUid) {
    console.log(`\n▸ Support thread (support/${authUid}/messages)`);
    const msgs = await db.collection("support").doc(authUid).collection("messages").orderBy("timestamp", "asc").get();
    console.log(`    total messages: ${msgs.size}`);
    for (const m of msgs.docs) {
      const x: any = m.data();
      const from = x.from || x.sender || x.role || x.author || "?";
      const text = x.text || x.message || x.content || x.body || "";
      const t = ts(x.timestamp) || ts(x.created_at) || "-";
      console.log(`\n    [${t}] ${from}:`);
      console.log(`      ${text.toString().slice(0, 500)}`);
      // Show all keys in case schema is different
      const otherKeys = Object.keys(x).filter(k => !["from","sender","role","author","text","message","content","body","timestamp","created_at"].includes(k));
      if (otherKeys.length) {
        console.log(`      (other keys: ${otherKeys.join(", ")})`);
      }
    }
  }

  // ── Calls subcollection ──────────────────────────────────────
  if (authUid) {
    console.log(`\n▸ Scheduled calls (Users/${authUid}/Calls)`);
    const calls = await db.collection("Users").doc(authUid).collection("Calls").get();
    console.log(`    count: ${calls.size}`);
    for (const c of calls.docs) {
      const x: any = c.data();
      console.log(`    ${c.id}: type=${x.type || x.call_type || "?"} status=${x.status || "?"} scheduled=${ts(x.scheduled_at) || x.scheduled_at_str || "-"}`);
    }
  }

  // ── Other subcollections ─────────────────────────────────────
  if (authUid) {
    const subs = await db.collection("Users").doc(authUid).listCollections();
    console.log(`\n▸ User subcollections: ${subs.map(s => s.id).join(", ") || "(none)"}`);
  }
})();
