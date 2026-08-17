// Triage pavanchinna777@gmail.com — full doc + RC + support thread

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT||"","base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const auth = getAuth();
const RC_KEY = process.env.RC_API_SECRET_KEY!;

const EMAIL = "pavanchinna777@gmail.com";

const ts = (t:any) => { try { return t?.toDate?.()?.toISOString() ?? "-"; } catch { return "-"; } };

async function rc(uid:string){
  try {
    const r = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_KEY}` } });
    if (!r.ok) return { error: `HTTP ${r.status}` };
    return await r.json();
  } catch (e:any) { return { error: e.message }; }
}

(async () => {
  console.log(`\n═══ ${EMAIL} ═══\n`);

  let authUid: string | null = null;
  try {
    const u = await auth.getUserByEmail(EMAIL);
    authUid = u.uid;
    console.log(`▸ Auth: uid=${u.uid} providers=${u.providerData.map(p=>p.providerId).join("/")} created=${u.metadata.creationTime} last=${u.metadata.lastSignInTime}`);
  } catch (e:any) {
    console.log(`▸ Auth: NOT FOUND`);
  }

  const byEmail = await db.collection("Users").where("email","==",EMAIL).get();
  console.log(`\n▸ Firestore docs by email: ${byEmail.size}`);
  for (const d of byEmail.docs) {
    const x:any = d.data();
    console.log(`\n── doc ${d.id} ──`);
    for (const k of [
      "user_type","providerId","first_name","selected_gender",
      "created_at","modified_at","start_date","converted_at","paid_at","first_paid_at",
      "trial_status","subscription_plan","treatment_stage",
      "free_stoppage_switched_at_date","free_maintenance_switched_at_date",
      "regrowth_switched_at_date","free_stoppage_ext_switched_at_date",
      "stabilization_confirmed","extra_user_tags","open_account","pro",
      "regrowth_treatment_purchased","scalp_health_support_purchased","vip_treatment_purchased",
      "referral_source","hair_loss_location","hair_goal","commitment_answer",
      "qr_scanned","starter_photos_submit_submitted_once",
      "razorpay_subscription_id","razorpay_customer_id","stripe_customer_id",
      "is_deleted","support_needs",
    ]) {
      const v = x[k];
      let display:string;
      if (v && typeof v === "object" && v.toDate) display = ts(v);
      else if (typeof v === "object") display = JSON.stringify(v);
      else display = String(v ?? "-");
      console.log(`  ${k.padEnd(36)} ${display}`);
    }
    console.log(`  phone                                ${x.phone_number?.complete_number||"-"} (${x.phone_number?.country_code||"-"})`);
    console.log(`  progress days                        ${x.progress?Object.keys(x.progress).length:"-"}`);
    console.log(`  aftercare_progress days              ${x.aftercare_progress?Object.keys(x.aftercare_progress).length:"-"}`);
    console.log(`  regrowth_progress days               ${x.regrowth_progress?Object.keys(x.regrowth_progress).length:"-"}`);
  }

  if (!authUid && !byEmail.empty) authUid = byEmail.docs[0].id;

  if (authUid) {
    console.log(`\n▸ RC subscriber (uid=${authUid})`);
    const sub:any = await rc(authUid);
    if (sub.error) console.log(`  ${sub.error}`);
    else {
      const ents = sub?.subscriber?.entitlements || {};
      for (const [n,e] of Object.entries(ents) as any){
        const exp = new Date(e.expires_date);
        const active = exp.getTime() > Date.now();
        console.log(`  ent ${n}: ${active?"ACTIVE":"EXPIRED"} expires=${exp.toISOString()} product=${e.product_identifier}`);
      }
      if (!Object.keys(ents).length) console.log(`  entitlements: (none)`);
      const subs = sub?.subscriber?.subscriptions || {};
      for (const [n,s] of Object.entries(subs) as any) {
        console.log(`  sub ${n}: expires=${s.expires_date} store=${s.store} period=${s.period_type} unsub=${s.unsubscribe_detected_at||"-"} billing_issues=${s.billing_issues_detected_at||"-"}`);
      }
    }

    console.log(`\n▸ Support thread (support/${authUid}/messages)`);
    const msgs = await db.collection("support").doc(authUid).collection("messages").orderBy("timestamp","asc").get();
    console.log(`  total: ${msgs.size}`);
    for (const m of msgs.docs) {
      const x:any = m.data();
      const text = x.text || x.message || x.content || x.body || "";
      const fromId = x.fromId || "?";
      const t = ts(x.timestamp) || "-";
      // tag direction: if fromId === authUid then it's the user, otherwise the team
      const dir = fromId === authUid ? "USER" : "TEAM";
      console.log(`\n  [${t}] ${dir} (fromId=${fromId}):`);
      console.log(`    ${String(text).slice(0,800)}`);
    }
  }
})();
