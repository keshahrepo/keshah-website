import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "QcWaN9pzZAXUsv899wveOziKU1t2";
const content =
  "Hey! Two things:\n\nOn the reset time - I can shift it on my end to whatever time works for you. Most people set it to 8 or 9am so it lines up with their morning. What time would you like your day to reset each day? Just tell me and I'll change it.\n\nOn massage frequency - once a day is the routine, that's all you need. Do it whenever fits your day (morning or evening, doesn't matter) as long as you're consistent. Twice a day is fine if you want but not necessary. The key thing is doing it daily, don't stress too much about the exact timing.";
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
