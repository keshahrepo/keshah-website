// Same billing-bug apology as Alexis, sent to Om.
// karadom562@gmail.com  →  UCmTxRVBzcOzz2MI9uhqasP9ZBs2

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "UCmTxRVBzcOzz2MI9uhqasP9ZBs2";

const content =
  "Hi Om,\n\n" +
  "I noticed something on our side — when you signed up, our Android app should have offered you a 7-day free trial before charging you, but a bug billed you right away. I'm sorry about that.\n\n" +
  "We've fixed it now, but I wanted to reach out personally. Would you like us to refund your payment?\n\n" +
  "Aadi";

(async () => {
  const ref = await db
    .collection("support")
    .doc(UID)
    .collection("messages")
    .add({
      fromId: "0",
      content,
      attachments: null,
      feedback: null,
      type: "direct",
      timestamp: Timestamp.now(),
    });
  console.log(`✓ sent  msg=${ref.id}  uid=${UID}`);
  process.exit(0);
})().catch((e) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
