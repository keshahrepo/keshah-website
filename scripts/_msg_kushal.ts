// One-off in-app message to Kushal letting him know we granted free
// access + reminding him to cancel any App Store / Play Store trial.
//
// Run: set -a && source .env.local && set +a && npx tsx scripts/_msg_kushal.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const UID = "fDDR2gzHG0QXHEq0XRdl8Qzu3up2";
const TEAM_FROM_ID = "0";

const MESSAGE =
  `Hey Kushal — no worries about the trial on our end. I've upgraded your account so you have full free access for the next year, no charges from us.\n\n` +
  `One thing to check: if you started the trial through the App Store or Google Play (the screen where it showed a yearly price), you'll need to cancel that subscription yourself so Apple/Google don't auto-charge you when the trial ends. We can't cancel App Store / Play Store subscriptions for you — only Apple or Google can.\n\n` +
  `To cancel:\n` +
  `• iPhone: Settings → tap your name → Subscriptions → KESHAH → Cancel\n` +
  `• Android: Play Store app → tap your profile → Payments & subscriptions → Subscriptions → KESHAH → Cancel\n\n` +
  `To see your free access on our end, force-close the app and reopen it. If it still shows trial after that, sign out and back in once and it'll refresh.\n\n` +
  `Take care of yourself. If anything's not working, just message me back.`;

(async () => {
  await db.collection("support").doc(UID).collection("messages").add({
    fromId: TEAM_FROM_ID,
    content: MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ Sent message to ${UID}`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
