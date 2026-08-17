// Send Mattia the DIY oil recipes (Ojus + Vriddhi) that used to live in
// the app. Sourced verbatim from
// lib/screens/scalp_health_support/data/protocol_data.dart.
//
// Usage: set -a && source .env.local && set +a && npx tsx scripts/_msg_mattia_oil_recipes.ts

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
  );
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const EMAIL = "sgkkgqxgnn@privaterelay.appleid.com";
const TEAM_FROM_ID = "0";

const MESSAGE =
  `Hey Mattia — here are the two DIY recipes that used to be in the app. Both make 30 ml. Use dark glass dropper bottles, store cool and dark, shake before each use.\n\n` +
  `━━━━━━━━━━━━━━━━━━━\n` +
  `OJUS OIL — Deep Nourishment Complex (Bottle 1, 30 ml)\n` +
  `━━━━━━━━━━━━━━━━━━━\n\n` +
  `1. Start with 10.5 ml coconut oil as your base — warm gently until liquid.\n` +
  `2. Add 6 ml castor oil and stir to combine.\n` +
  `3. Mix in 6 ml sesame oil.\n` +
  `4. Add 4.5 ml bhringraj oil.\n` +
  `5. Add 1.5 ml neem oil — a little goes a long way.\n` +
  `6. Add 1.5 ml Japanese peppermint essential oil.\n` +
  `7. Stir thoroughly and pour into a dark glass dropper bottle.\n` +
  `8. Store in a cool, dark place. Shake before each use.\n\n` +
  `━━━━━━━━━━━━━━━━━━━\n` +
  `VRIDDHI OIL — Anti-inflammation Complex (Bottle 2, 30 ml)\n` +
  `━━━━━━━━━━━━━━━━━━━\n\n` +
  `1. Start with 9 ml sesame oil as your base.\n` +
  `2. Add 4.5 ml saw palmetto oil.\n` +
  `3. Mix in 3 ml moringa oil.\n` +
  `4. Add 3 ml apricot kernel oil.\n` +
  `5. Add 3 ml ashwagandha-infused oil.\n` +
  `6. Add 1.5 ml rosemary essential oil.\n` +
  `7. Add 1.5 ml yuzu essential oil.\n` +
  `8. Stir thoroughly and pour into a dark glass dropper bottle.\n` +
  `9. Store in a cool, dark place. Shake before each use.\n\n` +
  `━━━━━━━━━━━━━━━━━━━\n` +
  `HOW TO APPLY\n` +
  `━━━━━━━━━━━━━━━━━━━\n\n` +
  `Apply 2–3 drops to your scalp after each session. Massage gently into affected areas.\n\n` +
  `Quality notes: use cold-pressed, unrefined versions of every carrier oil. For essential oils (peppermint, rosemary, yuzu) make sure they're actual essential oils not fragrance oils.\n\n` +
  `Let me know if you have questions on any of the ingredients.`;

(async () => {
  console.log(`▸ Looking up user: ${EMAIL}`);
  const snap = await db.collection("Users").where("email", "==", EMAIL).limit(1).get();
  if (snap.empty) {
    console.error(`  ✗ no user found`);
    process.exit(1);
  }
  const uid = snap.docs[0].id;
  console.log(`  ✓ found UID: ${uid}\n`);

  await db.collection("support").doc(uid).collection("messages").add({
    fromId: TEAM_FROM_ID,
    content: MESSAGE,
    attachments: null,
    feedback: null,
    type: "direct",
    timestamp: Timestamp.now(),
  });
  console.log(`✓ Oil recipes sent to ${EMAIL}`);
  process.exit(0);
})().catch((e: Error) => { console.error("ERR:", e.message); process.exit(1); });
