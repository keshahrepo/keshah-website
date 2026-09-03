import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const UID = "R1kQBfo7yMWlqAcGn8uqBnPtqnT2";
const content =
  "Hey, this is Aadi, founder of KESHAH. I built KESHAH after this routine fixed my own hair loss, and I really hope it helps you the same way. If you have any questions, you can reach out to me here (I try to reply to each message personally - so apologies if I'm a bit slow!). At anytime, if you feel KESHAH isn't the right thing for you, just reply here and I'll cancel your trial right away. Let's do this.";
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
