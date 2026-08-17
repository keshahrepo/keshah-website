import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UIDS = [
  "z7zXJjRbD7", "a1WmH78qcL", "tkZcxHvWIu", "6VsVcBzwtk",
  "w3GrQAl8uX", "WYfCffdsW2",
];

(async () => {
  // First, get full UIDs by partial match
  const snap = await db.collection("Users")
    .where("trial_started_at", ">=", new Date(Date.now() - 30 * 86_400_000))
    .get();

  const targetDocs = snap.docs.filter(d => UIDS.some(uid => d.id.startsWith(uid)));
  console.log(`Inspecting ${targetDocs.length} trial users in detail\n`);

  for (const d of targetDocs) {
    const x = d.data() as any;
    console.log(`═══ ${d.id} ═══`);
    console.log(`  email:                  ${x.email || "-"}`);
    console.log(`  created_at:             ${x.created_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`  trial_started_at:       ${x.trial_started_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`  signup_source:          ${x.signup_source || "(unset)"}`);
    console.log(`  source:                 ${x.source || "-"}`);
    console.log(`  lead_source:            ${x.lead_source || "-"}`);
    console.log(`  utm_source:             ${x.utm_source || "-"}`);
    console.log(`  referral_source:        ${x.referral_source || "-"}`);
    console.log(`  nurture_started_at:     ${x.nurture_started_at?.toDate?.()?.toISOString() || "-"}`);
    console.log(`  nurture_whatsapp_sent:  ${JSON.stringify(x.nurture_whatsapp_sent || [])}`);
    console.log(`  nurture_completed:      ${x.nurture_completed || false}`);
    console.log(`  phone_number:           ${x.phone_number?.complete_number || x.phone || "-"}`);
    console.log(`  providerId:             ${x.providerId || "-"}`);
    console.log(`  payment_provider:       ${x.payment_provider || "-"}`);
    console.log(`  plan:                   ${x.plan || "-"}`);
    console.log(`  trial_status:           ${x.trial_status || "-"}`);
    console.log(`  extra_user_tags:        ${JSON.stringify(x.extra_user_tags || [])}`);
    console.log(`  All keys:               ${Object.keys(x).filter(k => k.includes("source") || k.includes("nurture") || k.includes("whatsapp") || k.includes("signup") || k.includes("utm") || k.includes("trial")).join(", ")}`);
    console.log();
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
