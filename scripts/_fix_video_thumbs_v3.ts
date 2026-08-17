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

async function upload(localPath: string, remotePath: string, contentType: string) {
  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: { contentType, cacheControl: "public, max-age=31536000" },
  });
  await bucket.file(remotePath).makePublic();
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(remotePath)}?alt=media`;
}

const SCIENCE_NAME = "The Science Of Hair Loss";
const EXPECT_NAME = "What To Expect";

(async () => {
  // Upload raw aadi.png — reused for both videos
  const aadiUrl = await upload("/tmp/aadi.png", "videos/aadi_thumb.png", "image/png");
  console.log(`✓ uploaded ${aadiUrl}`);

  const collections = [
    { name: "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_MEN_STOPPAGE_EXERCISES" },
    { name: "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_WOMEN_STOPPAGE_EXERCISES" },
  ];

  for (const { name } of collections) {
    // Science: update name + thumbnail, keep video details
    await db.collection(name).doc("science_of_hair_loss_00").update({
      name: SCIENCE_NAME,
      thumbnail_image: aadiUrl,
    });
    console.log(`✓ ${name}/science_of_hair_loss_00 → ${SCIENCE_NAME}`);

    await db.collection(name).doc("what_to_expect_00").update({
      name: EXPECT_NAME,
      thumbnail_image: aadiUrl,
    });
    console.log(`✓ ${name}/what_to_expect_00 → ${EXPECT_NAME}`);
  }

  // Also patch test75 and any other user whose progress.day1 has the old names/thumbs in place
  const snap = await db.collection("Users").get();
  let patched = 0;
  for (const d of snap.docs) {
    const x = d.data() as any;
    const day1 = x.progress?.day1;
    if (!Array.isArray(day1)) continue;
    let changed = false;
    const newDay1 = day1.map((t: any) => {
      if (t.exercise_id === "The science of hair loss") {
        changed = true;
        return { ...t, exercise_id: SCIENCE_NAME, thumbnailImage: aadiUrl };
      }
      if (t.exercise_id === "What to expect") {
        changed = true;
        return { ...t, exercise_id: EXPECT_NAME, thumbnailImage: aadiUrl };
      }
      if (t.exercise_id === SCIENCE_NAME || t.exercise_id === EXPECT_NAME) {
        // Already renamed, just update thumbnail
        changed = true;
        return { ...t, thumbnailImage: aadiUrl };
      }
      return t;
    });
    if (changed) {
      await d.ref.update({ "progress.day1": newDay1 });
      patched++;
    }
  }
  console.log(`✓ patched ${patched} existing users' progress.day1`);
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
