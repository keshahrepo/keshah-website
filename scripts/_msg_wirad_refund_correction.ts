// Correction to Wirad about refund — needs to go through Apple/Google
// directly, not through us, since that's where the purchase was made.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_msg_wirad_refund_correction.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "2ArkV6L9QWJDlLfT63XK";
const TEAM_FROM_ID = "0";

const MESSAGE =
  `Quick correction on that — since the purchase went through Apple (or Google if you're on Android), the refund has to be requested from them directly, not from us.\n\n` +
  `On iPhone:\n` +
  `Go to reportaproblem.apple.com, sign in with your Apple ID, find the KESHAH charge, and select "Request a refund." Reason: "Doesn't work as expected."\n\n` +
  `On Android:\n` +
  `Open the Play Store app → tap your profile → Payments & subscriptions → Budget & history → find KESHAH and request refund.\n\n` +
  `Apple usually approves refunds within 24-48 hours if you explain the app hasn't been working for you. Given how long you've been stuck they should approve without issue. If they don't, message me back and I'll write to them on your behalf.\n\n` +
  `Sorry again for the trouble.`;

(async () => {
  await db.collection("support").doc(UID).collection("messages").add({
    fromId: TEAM_FROM_ID,
    content: MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ Refund-process correction sent to Wirad (${UID})`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
