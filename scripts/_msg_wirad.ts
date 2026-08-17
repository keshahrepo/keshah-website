// Support reply to Wirad about the splash-screen hang.
// He's a German expat in Indonesia (Asia/Makassar timezone, +49 phone),
// hitting network-caused startup hangs. Reply gives him ordered
// troubleshooting steps.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_msg_wirad.ts

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
  `Hey Wirad — the "stuck on logo" issue is your app waiting on our servers to respond. It happens when WiFi shows connected but the connection is slow or blocked (common in some regions).\n\n` +
  `Try these in order, stop at whichever works:\n\n` +
  `1. Force close the app fully, then reopen (swipe up from the app switcher, don't just background it).\n\n` +
  `2. Turn WiFi off, use mobile data instead — if you have signal, this bypasses any WiFi issue.\n\n` +
  `3. Try a different WiFi (hotspot from another phone, or different location).\n\n` +
  `4. If none of those work: uninstall the app, restart your phone, then reinstall from the app store. You'll need to sign in with hallowidwan@gmail.com again.\n\n` +
  `You made it in before (I can see you completed Day 1), so this is likely a network glitch — not something wrong with your account. Let me know if reinstalling doesn't fix it and I'll dig deeper.`;

(async () => {
  await db.collection("support").doc(UID).collection("messages").add({
    fromId: TEAM_FROM_ID,
    content: MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ Sent message to ${UID} (hallowidwan@gmail.com)`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
