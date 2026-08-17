import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({
    credential: cert(sa),
    storageBucket: "keshah-app.appspot.com",
  });
}
const db = getFirestore();
const bucket = getStorage().bucket();

(async () => {
  await bucket.upload("/tmp/science_icon.png", {
    destination: "videos/science_thumb.png",
    metadata: { contentType: "image/png", cacheControl: "public, max-age=31536000" },
  });
  await bucket.file("videos/science_thumb.png").makePublic();
  const url = `https://firebasestorage.googleapis.com/v0/b/keshah-app.appspot.com/o/${encodeURIComponent("videos/science_thumb.png")}?alt=media`;
  console.log(`✓ uploaded ${url}`);

  for (const name of ["FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL"]) {
    await db.collection(name).doc("science_of_hair_loss_00").update({ thumbnail_image: url });
    console.log(`✓ updated ${name}/science_of_hair_loss_00`);
  }

  // Patch existing users' progress.day1
  const snap = await db.collection("Users").get();
  let patched = 0;
  for (const d of snap.docs) {
    const x = d.data() as any;
    const day1 = x.progress?.day1;
    if (!Array.isArray(day1)) continue;
    let changed = false;
    const newDay1 = day1.map((t: any) => {
      if (t.exercise_id === "The Science Of Hair Loss") {
        changed = true;
        return { ...t, thumbnailImage: url };
      }
      return t;
    });
    if (changed) {
      await d.ref.update({ "progress.day1": newDay1 });
      patched++;
    }
  }
  console.log(`✓ patched ${patched} existing users`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
