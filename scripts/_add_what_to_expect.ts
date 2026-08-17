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
  await bucket.file(remotePath).makePublic();
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(remotePath)}?alt=media`;
  console.log(`✓ uploaded ${remotePath}`);
  console.log(`  url: ${url}`);
  return url;
}

(async () => {
  const videoUrl = await uploadAndMakePublic(
    "/tmp/what_to_expect.mp4",
    "videos/what_to_expect.mp4",
    "video/mp4"
  );
  const thumbUrl = await uploadAndMakePublic(
    "/tmp/what_to_expect_thumb.jpg",
    "videos/what_to_expect_thumb.jpg",
    "image/jpeg"
  );

  const exerciseId = "what_to_expect_00";
  const DURATION_MIN = 5; // 4:53 → rounds to 5

  const exerciseModel = {
    id: exerciseId,
    name: "What to expect",
    description:
      "Most members see their hair fall stop within 60-90 days. Aadi walks you through what progress actually looks like — week by week — so you know what's normal, what's a milestone, and how to stay consistent through the parts that feel slow.",
    thumbnail_image: thumbUrl,
    target: null,
    videos: [
      {
        url: videoUrl,
        duration: DURATION_MIN,
        orientation: "landscape",
        title: "What to expect",
        subtitle: "Your 60-90 day journey",
      },
    ],
  };

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

    const day1Ref = db.collection(listName).doc("Day1");
    const day1Doc = await day1Ref.get();
    if (!day1Doc.exists) {
      console.log(`  ! ${listName}/Day1 does not exist, skipping`);
      continue;
    }
    const exercises = (day1Doc.data() as any).exercises || [];
    if (exercises.some((e: any) => e.exerciseId === exerciseId)) {
      console.log(`  ${listName}/Day1 already has ${exerciseId}, skipping`);
      continue;
    }
    // Append to the end — "what to expect" is the last task
    const newExercises = [...exercises, { exerciseId, duration: DURATION_MIN }];
    if (DRY_RUN) {
      console.log(`  [dry] would set ${listName}/Day1.exercises to:`);
      for (const e of newExercises) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    } else {
      await day1Ref.update({ exercises: newExercises });
      console.log(`  ✓ updated ${listName}/Day1`);
      for (const e of newExercises) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN done — add --apply to write." : "✓ Done."}`);
  process.exit(0);
})().catch((e: any) => {
  console.error("ERR:", e.message);
  process.exit(1);
});
