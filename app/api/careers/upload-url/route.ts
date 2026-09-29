// Generate a v4-signed PUT URL so the browser can upload the applicant's
// test video directly to Google Cloud Storage (Firebase Storage). We
// route around the API on the file body itself — Vercel serverless
// functions have a 4.5MB payload cap and a 60-second MP4 blows past it.
// Only metadata (name, email, video path) flows through /api/careers/apply.

import { NextResponse } from "next/server";
import { getStorage } from "firebase-admin/storage";
import { initializeApp, getApps, cert } from "firebase-admin/app";

function admin() {
  if (!getApps().length) {
    const sa = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
    );
    initializeApp({ credential: cert(sa) });
  }
}

// Server-side lifetime — keep short so leaked URLs go stale fast.
const UPLOAD_URL_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes

// Bucket lives on the keshah-app Firebase project (same project used by
// the mobile app). Override via env for staging if we ever add one.
const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "keshah-app.appspot.com";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      filename?: string;
      contentType?: string;
      sizeBytes?: number;
    };
    const filename = (body.filename ?? "video.mp4").replace(/[^\w.\-]/g, "_");
    const contentType = body.contentType ?? "video/mp4";
    const sizeBytes = body.sizeBytes ?? 0;

    // Server-side guardrails so someone can't request an upload URL for
    // an 800MB blob and bloat the bucket.
    if (!/^video\/(mp4|quicktime)$/.test(contentType)) {
      return NextResponse.json(
        { error: "Only MP4 or MOV videos are accepted." },
        { status: 400 }
      );
    }
    if (sizeBytes > 200 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Video exceeds the 200MB size cap." },
        { status: 400 }
      );
    }

    admin();
    // Object path: keep applications grouped under a top-level prefix
    // so a bucket-level lifecycle rule can prune stale drafts later.
    // Random suffix prevents guessable enumeration.
    const uploadId = `${Date.now().toString(36)}_${Math.random()
      .toString(36)
      .slice(2, 10)}`;
    const objectPath = `careers-applications/pending/${uploadId}/${filename}`;

    const file = getStorage().bucket(BUCKET).file(objectPath);
    const [uploadUrl] = await file.getSignedUrl({
      version: "v4",
      action: "write",
      expires: Date.now() + UPLOAD_URL_EXPIRY_MS,
      contentType,
    });

    return NextResponse.json({ uploadUrl, objectPath });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
