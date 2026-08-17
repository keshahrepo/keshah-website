import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const RC_KEY = process.env.RC_API_SECRET_KEY!;
const PROJECT_ID = "proj4777c533";
(async () => {
  const snap = await db.collection("Users").where("pro", "==", true).limit(3).get();
  for (const doc of snap.docs) {
    const uid = doc.id;
    console.log(`\n=== ${uid} (email=${doc.data().email}) ===`);
    const url = `https://api.revenuecat.com/v2/projects/${PROJECT_ID}/customers/${encodeURIComponent(uid)}/subscriptions`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${RC_KEY}` } });
    console.log(`  HTTP ${res.status}`);
    const text = await res.text();
    console.log(`  Body (first 800 chars): ${text.slice(0, 800)}`);
  }
  process.exit(0);
})();
