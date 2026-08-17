import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "liCmoUaobZhsrETzBG20gNO4prv2";
const content =
  "Fixed on my end! Force-close the app and reopen, you should now see Day 1 on your calendar and be able to press into it. On the kit, no you definitely don't need it, the daily routine is the core of the program and the kit just helps speed things up. Let me know if anything else looks off.";
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
