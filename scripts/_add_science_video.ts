import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import * as fs from "fs";

if (!getApps().length) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString());
  initializeApp({
    credential: cert(sa),
    storageBucket: "keshah-app.appspot.com",
  });
}
const db = getFirestore();
const bucket = getStorage().bucket();

const DRY_RUN = !process.argv.includes("--apply");

async function uploadAndMakePublic(localPath: string, remotePath: string, contentType: string) {
  if (DRY_RUN) {
    console.log(`[dry] would upload ${localPath} → gs://${bucket.name}/${remotePath}`);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(remotePath)}?alt=media`;
  }
  await bucket.upload(localPath, {
    destination: remotePath,
    metadata: { contentType, cacheControl: "public, max-age=31536000" },
  });
  // Make public by setting a download token that never expires via ACL.
  await bucket.file(remotePath).makePublic();
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(remotePath)}?alt=media`;
  console.log(`✓ uploaded ${remotePath}`);
  console.log(`  url: ${url}`);
  return url;
}

(async () => {
  const videoUrl = await uploadAndMakePublic(
    "/tmp/science_of_hair_loss.mp4",
    "videos/science_of_hair_loss.mp4",
    "video/mp4"
  );
  const thumbUrl = await uploadAndMakePublic(
    "/tmp/science_of_hair_loss_thumb.jpg",
    "videos/science_of_hair_loss_thumb.jpg",
    "image/jpeg"
  );

  const exerciseId = "science_of_hair_loss_00";
  const DURATION_MIN = 5; // 4:21 → rounds to 5

  const exerciseModel = {
    id: exerciseId,
    name: "The science of hair loss",
    description:
      "Hair loss starts with a tight scalp. Aadi breaks down the science — why scalp tension chokes blood flow to your follicles, what recent research shows, and why loosening your scalp is the foundation of everything you'll do next.",
    thumbnail_image: thumbUrl,
    target: null,
    videos: [
      {
        url: videoUrl,
        duration: DURATION_MIN,
        orientation: "landscape",
        title: "The science of hair loss",
        subtitle: "Why scalp tension causes hair loss",
      },
    ],
  };

  // Add to both stoppage model collections — men's and women's so both genders see it
  const collections = [
    { name: "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_MEN_STOPPAGE_EXERCISES" },
    { name: "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_WOMEN_STOPPAGE_EXERCISES" },
  ];

  for (const { name, listName } of collections) {
    if (DRY_RUN) {
      console.log(`\n[dry] would upsert ${name}/${exerciseId}`);
    } else {
      await db.collection(name).doc(exerciseId).set(exerciseModel);
      console.log(`\n✓ wrote ${name}/${exerciseId}`);
    }

    // Update Day1 list — insert between pressing (first) and pinching (second)
    const day1Ref = db.collection(listName).doc("Day1");
    const day1Doc = await day1Ref.get();
    if (!day1Doc.exists) {
      console.log(`  ! ${listName}/Day1 does not exist, skipping`);
      continue;
    }
    const exercises = (day1Doc.data() as any).exercises || [];
    // Skip if already present (idempotent)
    if (exercises.some((e: any) => e.exerciseId === exerciseId)) {
      console.log(`  ${listName}/Day1 already has ${exerciseId}, skipping`);
      continue;
    }
    // Insert at index 1 (between pressing and pinching)
    const newExercises = [
      exercises[0],
      { exerciseId, duration: DURATION_MIN },
      ...exercises.slice(1),
    ];
    if (DRY_RUN) {
      console.log(`  [dry] would set ${listName}/Day1.exercises to:`);
      for (const e of newExercises) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    } else {
      await day1Ref.update({ exercises: newExercises });
      console.log(`  ✓ updated ${listName}/Day1`);
      for (const e of newExercises) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN done — add --apply to write." : "✓ All done. New users on Day 1 will see the video between Pressing and Pinching."}`);
  process.exit(0);
})().catch((e: any) => {
  console.error("ERR:", e.message);
  console.error(e);
  process.exit(1);
});
