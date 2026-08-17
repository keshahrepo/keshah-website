import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "QcWaN9pzZAXUsv899wveOziKU1t2";
const content =
  "Sorry, correction on my last message - the daily reset actually happens automatically at 4 AM local time for everyone, it's not tied to when you signed up. So your countdown will roll over at 4 AM every day, no change needed on my end.\n\nAnd on the massage - once a day is all you need, whenever fits your schedule, just stay consistent.";
(async () => {
  const ref = await db.collection("support").doc(UID).collection("messages").add({
    fromId: "0",
    content,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ sent  msg=${ref.id}`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
