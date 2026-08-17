import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
(async () => {
  // Users who have BOTH start_date (purchased) AND nurture sends
  const snap = await db.collection("Users")
    .where("razorpay_subscription_id", "!=", null)
    .limit(30)
    .get();
  console.log("Paying Razorpay users sampled:", snap.size);
  let spammedAfterPurchase = 0;
  let safelySkipped = 0;
  for (const d of snap.docs) {
    const x = d.data();
    const hasPurchase = !!x.start_date;
    const sent: string[] = x.nurture_whatsapp_sent || [];
    const sentCount = sent.length;
    if (hasPurchase) {
      if (x.nurture_completed) safelySkipped++;
      console.log(`  ${d.id.slice(0,8)} · purchased · sent=${sentCount} · completed=${x.nurture_completed || false} · attrib=${x.whatsapp_converted || false}`);
    } else {
      console.log(`  ${d.id.slice(0,8)} · NO start_date · sent=${sentCount} · trial=${x.trial_status || "-"}`);
    }
  }
  console.log(`\nSafely skipped (start_date + nurture_completed=true): ${safelySkipped}`);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
