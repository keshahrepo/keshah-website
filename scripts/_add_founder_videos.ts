// Adds three Aadi founder videos as the LAST task on Day 3, Day 5, Day 15
// of the FreeV2 stoppage routine, for both men and women.
//
// Videos are pre-encoded HLS on CloudFront (matches the pen_unboxingHLS
// pattern) — script only writes Firestore. Upload the HLS files to
// s3://<bucket>/keshah_v4/stream/ BEFORE running with --apply, or the URLs
// will 404 in-app.
//
// Thumbnail still uploads to Firebase Storage (no need for HLS — it's a
// single JPG). Same pattern as _add_what_to_expect.ts.
//
// orientation: "portrait" routes the dashboard to videoPlayerV2 — the
// vertical player used for scalp acupressure.
//
// Run from repo root:
//   DRY:    npx ts-node scripts/_add_founder_videos.ts
//   APPLY:  npx ts-node scripts/_add_founder_videos.ts --apply

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

interface FounderVideo {
  id: string;
  day: number;
  name: string;
  description: string;
  subtitle: string;
  durationMin: number; // ceil to nearest minute (matches existing pattern)
  hlsBasename: string; // matches the file at keshah_v4/stream/<basename>.m3u8
}

// HLS files live at https://dosm2lichqd6n.cloudfront.net/keshah_v4/stream/<basename>.m3u8
const HLS_BASE_URL = "https://dosm2lichqd6n.cloudfront.net/keshah_v4/stream";

// Round-up minutes used everywhere downstream — matches the comment style
// in _add_what_to_expect.ts ("4:53 → rounds to 5").
const VIDEOS: FounderVideo[] = [
  {
    id: "founder_check_in_day_3",
    day: 3,
    name: "Check-in with Aadi",
    description:
      "Three days in. Aadi checks in on what should be feeling different already, what's still ahead, and how to push through the first plateau.",
    subtitle: "Day 3 check-in",
    durationMin: 3, // 2:01 → 3
    hlsBasename: "founder_check_inHLS",
  },
  {
    id: "founder_regrow_day_5",
    day: 5,
    name: "How to regrow new hair",
    description:
      "Aadi walks through how regrowth actually works — why microneedling pairs with the daily routine, what the science shows, and how to set yourself up for it once your fall has stopped.",
    subtitle: "Day 5 founder note",
    durationMin: 4, // 3:36 → 4
    hlsBasename: "founder_regrowthHLS",
  },
  {
    id: "founder_qa_day_15",
    day: 15,
    name: "Q&A with Aadi",
    description:
      "Aadi answers the questions members ask most around the two-week mark — what's normal, what to watch for, and how to stay on track.",
    subtitle: "Day 15 Q&A",
    durationMin: 4, // 3:30 → 4
    hlsBasename: "founder_qaHLS",
  },
];

const SHARED_THUMB_LOCAL = "/tmp/founder_thumb.jpg";
const SHARED_THUMB_REMOTE = "videos/founder_thumb.jpg";

const COLLECTIONS = [
  { name: "FREEV2_MEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_MEN_STOPPAGE_EXERCISES" },
  { name: "FREEV2_WOMEN_STOPPAGE_EXERCISES_MODEL", listName: "FREEV2_WOMEN_STOPPAGE_EXERCISES" },
];

(async () => {
  // 1. Upload the shared Aadi headshot once.
  const thumbUrl = await uploadAndMakePublic(SHARED_THUMB_LOCAL, SHARED_THUMB_REMOTE, "image/jpeg");

  for (const v of VIDEOS) {
    console.log(`\n━━━ ${v.name} (Day ${v.day}) ━━━`);

    // 2. Verify the HLS playlist is reachable on CloudFront before we
    //    write a Firestore reference to it. Cheap fail-fast.
    const videoUrl = `${HLS_BASE_URL}/${v.hlsBasename}.m3u8`;
    if (!DRY_RUN) {
      const head = await fetch(videoUrl, { method: "HEAD" });
      if (!head.ok) {
        throw new Error(`HLS not reachable: ${videoUrl} (${head.status}). Upload to S3 first.`);
      }
      console.log(`✓ verified ${videoUrl}`);
    } else {
      console.log(`[dry] would verify ${videoUrl} is reachable`);
    }

    // 3. Build the exercise model. orientation: "portrait" routes to
    //    videoPlayerV2 in the app — same player used for scalp acupressure.
    const exerciseModel = {
      id: v.id,
      name: v.name,
      description: v.description,
      thumbnail_image: thumbUrl,
      target: null,
      videos: [
        {
          url: videoUrl,
          duration: v.durationMin,
          orientation: "portrait",
          title: v.name,
          subtitle: v.subtitle,
        },
      ],
    };

    // 4. Write to model + append to Day{N} for both men and women.
    for (const { name, listName } of COLLECTIONS) {
      if (DRY_RUN) {
        console.log(`[dry] would upsert ${name}/${v.id}`);
      } else {
        await db.collection(name).doc(v.id).set(exerciseModel);
        console.log(`✓ wrote ${name}/${v.id}`);
      }

      const dayRef = db.collection(listName).doc(`Day${v.day}`);
      const daySnap = await dayRef.get();
      if (!daySnap.exists) {
        console.log(`  ! ${listName}/Day${v.day} does not exist, skipping`);
        continue;
      }
      const existing = (daySnap.data() as { exercises?: { exerciseId: string; duration: number }[] }).exercises ?? [];
      if (existing.some((e) => e.exerciseId === v.id)) {
        console.log(`  ${listName}/Day${v.day} already has ${v.id}, skipping`);
        continue;
      }
      // Append at the END — founder video is the last task of the day.
      const next = [...existing, { exerciseId: v.id, duration: v.durationMin }];
      if (DRY_RUN) {
        console.log(`  [dry] would set ${listName}/Day${v.day}.exercises (${next.length} entries):`);
        for (const e of next) console.log(`    ${e.exerciseId} · duration=${e.duration}`);
      } else {
        await dayRef.update({ exercises: next });
        console.log(`  ✓ updated ${listName}/Day${v.day} (${next.length} tasks total)`);
      }
    }
  }

  console.log(`\n${DRY_RUN ? "DRY RUN done — add --apply to write." : "✓ Done. Founder videos live on Day 3, 5, 15 for FreeV2 men + women stoppage."}`);
  process.exit(0);
})().catch((e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error("ERR:", msg);
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(1);
});
