import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const THUMB_SCI = "https://firebasestorage.googleapis.com/v0/b/keshah-app.appspot.com/o/videos%2Fscience_of_hair_loss_thumb_v2.jpg?alt=media";
const THUMB_WTE = "https://firebasestorage.googleapis.com/v0/b/keshah-app.appspot.com/o/videos%2Fwhat_to_expect_thumb_v2.jpg?alt=media";

const UIDS = ["wLsYT1QWp0e3fhGDoUkM"];

(async () => {
  for (const uid of UIDS) {
    const ref = db.collection("Users").doc(uid);
    const d = await ref.get();
    if (!d.exists) { console.log(`${uid}: not found`); continue; }
    const x = d.data() as any;
    const day1 = x.progress?.day1;
    if (!Array.isArray(day1)) { console.log(`${uid}: no day1`); continue; }
    const patched = day1.map((t: any) => {
      if (t.exercise_id === "The science of hair loss") return { ...t, thumbnailImage: THUMB_SCI };
      if (t.exercise_id === "What to expect") return { ...t, thumbnailImage: THUMB_WTE };
      return t;
    });
    await ref.update({ "progress.day1": patched });
    console.log(`✓ ${uid} day1 thumbnails updated`);
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
