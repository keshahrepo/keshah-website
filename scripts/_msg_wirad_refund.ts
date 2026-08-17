// Follow-up to Wirad about the splash-screen hang. Troubleshooting didn't
// resolve it and the issue isn't reproducing for other users, so offering
// a refund instead of continuing to debug.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_msg_wirad_refund.ts

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
  `Hey Wirad — I'm sorry the splash screen issue is still happening. We've checked and we're not seeing this reported by any other users, so it looks like something specific to your setup that we haven't been able to reproduce or fix from our end.\n\n` +
  `Given that, I'd rather just refund you than keep you stuck. Reply here with the email address you used to purchase and I'll process the refund today.\n\n` +
  `Really sorry we couldn't sort this out for you.`;

(async () => {
  await db.collection("support").doc(UID).collection("messages").add({
    fromId: TEAM_FROM_ID,
    content: MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ Refund offer sent to Wirad (${UID})`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
