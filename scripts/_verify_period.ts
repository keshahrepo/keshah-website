import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const LAUNCH = new Date("2026-02-23T00:00:00Z");

(async () => {
  const snap = await db.collection("Users").where("created_at", ">=", LAUNCH).limit(300).get();
  const users = snap.docs.filter(d => d.data().start_date && !d.data().is_deleted).slice(0, 100);
  
  let trialPeriod = 0, normalPeriod = 0, introPeriod = 0, noEnt = 0, expired = 0;
  const samples: string[] = [];
  
  for (const u of users) {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(u.id)}`, {
      headers: { Authorization: `Bearer ${RC_KEY}` },
    });
    if (!res.ok) continue;
    const data: any = await res.json();
    const ent = data?.subscriber?.entitlements?.stoppage_treatment;
    if (!ent) { noEnt++; continue; }
    if (new Date(ent.expires_date).getTime() < Date.now()) { expired++; continue; }
    const subs = data?.subscriber?.subscriptions?.[ent.product_identifier];
    const period = subs?.period_type;
    if (period === "trial") trialPeriod++;
    else if (period === "intro") introPeriod++;
    else normalPeriod++;
    if (samples.length < 8 && period) {
      samples.push(`${ent.product_identifier.padEnd(30)} period_type=${period}`);
    }
  }
  console.log(`Sampled ${users.length} users`);
  console.log(`  normal period_type (real paid): ${normalPeriod}`);
  console.log(`  trial period_type:              ${trialPeriod}`);
  console.log(`  intro period_type (discounted): ${introPeriod}`);
  console.log(`  expired:                        ${expired}`);
  console.log(`  no entitlement:                 ${noEnt}`);
  console.log(`\nSample product_id + period_type:`);
  samples.forEach(s => console.log(`  ${s}`));
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
