import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "9VDMxxEWKpRlaWcxcU4r";
const content =
  "Actually one correction on what I said - I looked closer and found the real issue. Your account had a broken timezone setup that was making the app think you were on Day 0 even though you'd finished today's routine. I just fixed it on my end. Force-close the app and reopen it and you should see your 4 completed tasks with green checks. Your Day 2 routine unlocks at 4 AM Dublin time. Sorry for the confusion!";
(async () => {
  const ref = await db.collection("support").doc(UID).collection("messages").add({
    fromId: "0",
    content,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ sent msg=${ref.id}`);
  process.exit(0);
})().catch(e => { console.error("ERR:", e.message); process.exit(1); });
