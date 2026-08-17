import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

(async () => {
  const snap = await db.collection("Users")
    .where("signup_source", "==", "web_funnel")
    .get();
  console.log(`Total web_funnel leads: ${snap.size}`);

  let totalMsgs = 0;
  let recipients = 0;
  const byTemplate: Record<string, number> = {};

  for (const d of snap.docs) {
    const x = d.data();
    const sent: string[] = x.nurture_whatsapp_sent || [];
    if (sent.length > 0) recipients++;
    totalMsgs += sent.length;
    for (const key of sent) {
      byTemplate[key] = (byTemplate[key] || 0) + 1;
    }
  }

  console.log(`Recipients (≥1 msg sent): ${recipients}`);
  console.log(`Total messages sent to web leads: ${totalMsgs}`);
  console.log(`\nBy template:`);
  Object.entries(byTemplate).sort().forEach(([k, v]) => {
    console.log(`  ${v.toString().padStart(4)} × ${k}`);
  });

  // Also count leads with trial activated (trial_status)
  let activeTrials = 0, converted = 0;
  for (const d of snap.docs) {
    const x = d.data();
    if (x.trial_status === "active") activeTrials++;
    if (x.start_date && x.razorpay_subscription_id) converted++;
  }
  console.log(`\nTrial conversions from web funnel: ${activeTrials} active trials, ${converted} full purchases`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
