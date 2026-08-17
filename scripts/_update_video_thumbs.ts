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

async function upload(localPath: string, remotePath: string) {
  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000" },
  });
  await bucket.file(remotePath).makePublic();
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(remotePath)}?alt=media`;
}

(async () => {
  const sciUrl = await upload("/tmp/science_of_hair_loss_thumb.jpg", "videos/science_of_hair_loss_thumb_v2.jpg");
  const wteUrl = await upload("/tmp/what_to_expect_thumb.jpg", "videos/what_to_expect_thumb_v2.jpg");
  console.log(`✓ ${sciUrl}`);
  console.log(`✓ ${wteUrl}`);

  for (const name of ["FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL"]) {
    await db.collection(name).doc("science_of_hair_loss_00").update({ thumbnail_image: sciUrl });
    await db.collection(name).doc("what_to_expect_00").update({ thumbnail_image: wteUrl });
    console.log(`✓ updated ${name}`);
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
