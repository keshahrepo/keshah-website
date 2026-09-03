// One-shot: repoint founder_day1_welcome exercise model at the shared
// Aadi headshot used by the other founder videos, instead of the
// per-video poster frame.

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const APPLY = process.argv.includes("--apply");
const SHARED_THUMB_URL =
  "https://firebasestorage.googleapis.com/v0/b/keshah-app.appspot.com/o/videos%2Ffounder_thumb.jpg?alt=media";

const COLLECTIONS = [
  "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL",
  "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL",
];

(async () => {
  for (const coll of COLLECTIONS) {
    const ref = db.collection(coll).doc("founder_day1_welcome");
    if (APPLY) {
      await ref.update({ thumbnail_image: SHARED_THUMB_URL });
      console.log(`✓ ${coll}/founder_day1_welcome.thumbnail_image → shared`);
    } else {
      const snap = await ref.get();
      const cur = (snap.data() as { thumbnail_image?: string } | undefined)?.thumbnail_image;
      console.log(`[dry] ${coll}/founder_day1_welcome`);
      console.log(`  from: ${cur}`);
      console.log(`  to:   ${SHARED_THUMB_URL}`);
    }
  }
  process.exit(0);
})().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
