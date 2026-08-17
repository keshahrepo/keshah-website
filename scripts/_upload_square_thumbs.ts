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
    metadata: { contentType: "image/png", cacheControl: "public, max-age=31536000" },
  });
  await bucket.file(remotePath).makePublic();
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(remotePath)}?alt=media`;
}

(async () => {
  const sciUrl = await upload("/tmp/science_square.png", "videos/science_thumb_square.png");
  const aadiUrl = await upload("/tmp/aadi_square.png", "videos/aadi_thumb_square.png");
  console.log(`✓ science: ${sciUrl}`);
  console.log(`✓ aadi:    ${aadiUrl}`);

  for (const name of ["FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL"]) {
    await db.collection(name).doc("science_of_hair_loss_00").update({ thumbnail_image: sciUrl });
    await db.collection(name).doc("what_to_expect_00").update({ thumbnail_image: aadiUrl });
    console.log(`✓ ${name}`);
  }

  // Patch test75 only (fast)
  const ref = db.collection("Users").doc("wLsYT1QWp0e3fhGDoUkM");
  const d = await ref.get();
  const day1 = (d.data() as any)?.progress?.day1;
  if (Array.isArray(day1)) {
    const patched = day1.map((t: any) => {
      if (t.exercise_id === "The Science Of Hair Loss") return { ...t, thumbnailImage: sciUrl };
      if (t.exercise_id === "What To Expect") return { ...t, thumbnailImage: aadiUrl };
      return t;
    });
    await ref.update({ "progress.day1": patched });
    console.log(`✓ test75 day1 patched`);
  }
  process.exit(0);
})().catch((e: any) => { console.error("ERR:", e.message); process.exit(1); });
