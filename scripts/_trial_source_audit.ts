import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const now = Date.now();
const D30 = new Date(now - 30 * 86_400_000);

(async () => {
  // Get every user with trial_started_at in last 30d, regardless of source
  const snap = await db.collection("Users")
    .where("trial_started_at", ">=", D30)
    .get();
  console.log(`Total trials (30d): ${snap.size}\n`);

  let gotWA = 0, noWA = 0;
  let bySrc: Record<string, number> = {};
  let srcAndWA: Record<string, { with: number; without: number }> = {};
  let trialUserDetails: Array<any> = [];

  for (const d of snap.docs) {
    const x = d.data() as any;
    const sent: string[] = x.nurture_whatsapp_sent || [];
    const hasWA = sent.length > 0;
    if (hasWA) gotWA++; else noWA++;

    const src = x.signup_source || "(unset)";
    bySrc[src] = (bySrc[src] || 0) + 1;
    if (!srcAndWA[src]) srcAndWA[src] = { with: 0, without: 0 };
    if (hasWA) srcAndWA[src].with++; else srcAndWA[src].without++;

    trialUserDetails.push({
      uid: d.id.slice(0,10),
      src,
      hasWA,
      msgCount: sent.length,
      status: x.trial_status,
      paid: !!(x.razorpay_subscription_id && x.paid_at),
      started: x.trial_started_at?.toDate?.()?.toISOString()?.slice(0,10),
      phone: x.phone_number?.complete_number || x.phone || "-",
      email: x.email || "-",
    });
  }

  console.log(`Of 29 trial users:`);
  console.log(`  Received ≥1 WhatsApp msg:  ${gotWA}`);
  console.log(`  Received 0 WhatsApp msgs:  ${noWA}\n`);

  console.log(`By signup_source:`);
  Object.entries(bySrc).sort((a,b) => b[1]-a[1]).forEach(([s,n]) => {
    const w = srcAndWA[s];
    console.log(`  ${s.padEnd(20)} ${String(n).padStart(3)} total · ${w.with} with WA · ${w.without} without`);
  });

  console.log(`\nPer-trial detail:`);
  trialUserDetails.sort((a,b) => a.started > b.started ? -1 : 1).forEach(t => {
    console.log(`  ${t.started} · ${t.uid} · src=${t.src.padEnd(12)} · WA=${t.hasWA ? String(t.msgCount) : 'no'} · ${t.status?.padEnd(10)} · paid=${t.paid} · ${t.email}`);
  });
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
