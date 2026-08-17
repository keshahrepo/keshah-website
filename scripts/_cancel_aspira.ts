import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const SUB_ID = "sub_SeRX9b0DDymwss";
const EMAIL = "aspira9999@gmail.com";

(async () => {
  const keyId = process.env.RAZORPAY_KEY_ID!;
  const keySecret = process.env.RAZORPAY_KEY_SECRET!;
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  // Razorpay subscription cancel — cancel_at_cycle_end=0 = immediate.
  // No refund issued (Razorpay doesn't auto-refund on cancel).
  const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${SUB_ID}/cancel`, {
    method: "POST",
    headers: { "Authorization": `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 0 }),
  });
  const body = await res.json();
  console.log("Razorpay status:", res.status);
  console.log("Razorpay response:", JSON.stringify(body, null, 2));

  if (res.status >= 200 && res.status < 300) {
    // Mirror cancellation in Firestore so support has a paper trail.
    const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
    if (!snap.empty) {
      await snap.docs[0].ref.update({
        subscription_cancelled_at: FieldValue.serverTimestamp(),
        subscription_status: "cancelled",
        modified_at: FieldValue.serverTimestamp(),
      });
      console.log("✓ Firestore updated for", snap.docs[0].id);
    }
  }
  process.exit(0);
})().catch((e:any)=>{console.error("ERR:", e.message); process.exit(1);});
