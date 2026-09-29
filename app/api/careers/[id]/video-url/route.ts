// Signed READ URL for an applicant's uploaded test video. Videos live
// in a private bucket path (careers-applications/pending/...); we mint
// a short-lived signed URL here so the admin can play/download without
// making the bucket world-readable.

import { NextResponse } from "next/server";
import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdmin } from "@/lib/firebase-admin";

function bootAdmin() {
  if (!getApps().length) {
    const sa = JSON.parse(
      Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT || "", "base64").toString()
    );
    initializeApp({ credential: cert(sa) });
  }
}

const BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET || "keshah-app.appspot.com";

// Short-lived — the admin usually plays or downloads once, so 30 min
// is plenty and limits blast radius if a URL leaks in browser history.
const READ_URL_EXPIRY_MS = 30 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    bootAdmin();
    const { db } = getFirebaseAdmin();
    const doc = await db.collection("careers_applications").doc(id).get();
    if (!doc.exists) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const data = doc.data() as { video_object_path?: string };
    const path = (data.video_object_path ?? "").trim();
    if (!path) {
      return NextResponse.json(
        { error: "No video attached." },
        { status: 404 }
      );
    }
    const file = getStorage().bucket(BUCKET).file(path);
    const [url] = await file.getSignedUrl({
      version: "v4",
      action: "read",
      expires: Date.now() + READ_URL_EXPIRY_MS,
    });
    return NextResponse.json({ url });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
