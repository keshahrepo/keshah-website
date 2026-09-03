// Adds a vertical Aadi welcome video as the LAST task of Day 1 in the
// FreeV2 stoppage routine, for both men and women. Same shape as
// _add_founder_videos.ts — HLS pre-uploaded to CloudFront, thumbnail
// uploaded to Firebase Storage, orientation "portrait" so the app
// routes to videoPlayerV2.
//
// Before --apply, upload the HLS files to S3:
//   aws s3 cp /private/tmp/claude-501/-Users-aadityaagrawal/a3c07714-7e12-4f7c-a742-cb2f3d8e5b2a/scratchpad/day1_welcome/ \
//     s3://keshah-video/keshah_v4/stream/ --recursive --exclude "*" \
//     --include "founder_day1_welcomeHLS*" --content-type "application/vnd.apple.mpegurl"
// (or set content-type per file — .m3u8 as above, .ts as video/mp2t)
//
// Run:
//   DRY:    npx ts-node scripts/_add_day1_welcome.ts
//   APPLY:  npx ts-node scripts/_add_day1_welcome.ts --apply

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
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

const HLS_BASE_URL = "https://dosm2lichqd6n.cloudfront.net/keshah_v4/stream";

const VIDEO = {
  id: "founder_day1_welcome",
  day: 1,
  name: "A note from Aadi",
  description:
    "Aadi's welcome and a look at what to expect over the coming weeks so you know what you're feeling and when.",
  subtitle: "Day 1 welcome",
  durationMin: 6, // 5:14 → rounds up to 6
  hlsBasename: "founder_day1_welcomeHLS",
};

const THUMB_LOCAL =
  "/private/tmp/claude-501/-Users-aadityaagrawal/a3c07714-7e12-4f7c-a742-cb2f3d8e5b2a/scratchpad/day1_welcome/founder_day1_welcome_thumb.jpg";
const THUMB_REMOTE = "videos/founder_day1_welcome_thumb.jpg";

const COLLECTIONS = [
  { name: "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_MEN_STOPPAGE_EXERCISES" },
  { name: "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_WOMEN_STOPPAGE_EXERCISES" },
];

async function uploadAndMakePublic(localPath: string, remotePath: string, contentType: string): Promise<string> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`local file missing: ${localPath}`);
  }
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
  const thumbUrl = await uploadAndMakePublic(THUMB_LOCAL, THUMB_REMOTE, "image/jpeg");

  console.log(`\n━━━ ${VIDEO.name} (Day ${VIDEO.day}) ━━━`);

  const videoUrl = `${HLS_BASE_URL}/${VIDEO.hlsBasename}.m3u8`;
  if (!DRY_RUN) {
    const head = await fetch(videoUrl, { method: "HEAD" });
    if (!head.ok) {
      throw new Error(`HLS not reachable: ${videoUrl} (${head.status}). Upload to S3 first.`);
    }
    console.log(`✓ verified ${videoUrl}`);
  } else {
    console.log(`[dry] would verify ${videoUrl} is reachable`);
  }

  const exerciseModel = {
    id: VIDEO.id,
    name: VIDEO.name,
    description: VIDEO.description,
    thumbnail_image: thumbUrl,
    target: null,
    videos: [
      {
        url: videoUrl,
        duration: VIDEO.durationMin,
        orientation: "portrait",
        title: VIDEO.name,
        subtitle: VIDEO.subtitle,
      },
    ],
  };

  for (const { name, listName } of COLLECTIONS) {
    if (DRY_RUN) {
      console.log(`[dry] would upsert ${name}/${VIDEO.id}`);
    } else {
      await db.collection(name).doc(VIDEO.id).set(exerciseModel);
      console.log(`✓ wrote ${name}/${VIDEO.id}`);
    }

    const dayRef = db.collection(listName).doc(`Day${VIDEO.day}`);
    const daySnap = await dayRef.get();
    if (!daySnap.exists) {
      console.log(`  ! ${listName}/Day${VIDEO.day} does not exist, skipping`);
      continue;
    }
    const existing = (daySnap.data() as { exercises?: { exerciseId: string; duration: number }[] }).exercises ?? [];
    if (existing.some((e) => e.exerciseId === VIDEO.id)) {
      console.log(`  ${listName}/Day${VIDEO.day} already has ${VIDEO.id}, skipping`);
      continue;
    }
    const next = [...existing, { exerciseId: VIDEO.id, duration: VIDEO.durationMin }];
    if (DRY_RUN) {
      console.log(`  [dry] would set ${listName}/Day${VIDEO.day}.exercises (${next.length} entries):`);
      for (const e of next) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
    } else {
      await dayRef.update({ exercises: next });
      console.log(`  ✓ updated ${listName}/Day${VIDEO.day} (${next.length} tasks total)`);
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN done — add --apply to write." : "✓ Done. Day 1 welcome live for FreeV2 men + women stoppage."}`);
  process.exit(0);
})().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("ERR:", msg);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
