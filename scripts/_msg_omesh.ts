import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "bn9rNdMr0gc923xLFDGoG9JWkgo2";
const content =
  "All fixed on my end - sorry for the delay. Force-close and reopen the app and your calendar should now show today as Day 1. Tap the day to see your scalp exercises. Let me know if you still hit anything off!";
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
