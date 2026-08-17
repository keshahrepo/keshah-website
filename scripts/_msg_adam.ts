import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "9VDMxxEWKpRlaWcxcU4r";
const content =
  "Hey Adam - good news, you actually did all 4 of today's tasks (Scalp Pressing, The Science of Hair Loss, Scalp Pinching, What to Expect) between 10:55 and 11:11 this morning. Your Day 2 routine will unlock at 4 AM Dublin time tomorrow. If the home screen looks blank right now, force-close the app and reopen it - it should show your completed tasks with green checkmarks. Then tomorrow morning you'll see fresh Day 2 routines. Let me know if it's still off after a restart!";
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
