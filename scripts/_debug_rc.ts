import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
console.log("RC key prefix:", RC_KEY?.slice(0, 6), "len:", RC_KEY?.length);

(async () => {
  // Pick 3 UIDs from paid-tagged users and try RC fetch
  const snap = await db.collection("Users").where("extra_user_tags", "array-contains", "paidStoppage").limit(3).get();
  for (const d of snap.docs) {
    const uid = d.id;
    console.log(`\n--- ${uid} ---`);
    console.log(`paid_at:`, d.data().paid_at?.toDate?.()?.toISOString?.() ?? "—");
    console.log(`razorpay_subscription_id:`, d.data().razorpay_subscription_id ?? "—");
    console.log(`payment_provider:`, d.data().payment_provider ?? "—");
    const url = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`;
    console.log(`URL: ${url}`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${RC_KEY}` } });
    console.log(`Status: ${res.status}`);
    const text = await res.text();
    console.log(`Body (first 500 chars): ${text.slice(0, 500)}`);
  }
  process.exit(0);
})().catch(e => { console.error("ERR:", e); process.exit(1); });
