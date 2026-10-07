// KESHAH Creators app: signed PUT URL for the test video (same bucket and
// careers-applications/pending/ path as /api/careers/upload-url, which the
// /interview page uses). The phone PUTs the file there with the same
// Content-Type, then calls /api/mobile/applicant/video/submit.
// POST (Bearer) { content_type, size_bytes, filename } -> { upload_url, object_path }

import { randomBytes } from "crypto";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { STORAGE_BUCKET } from "@/lib/creators/db";
import { videoProblem } from "@/lib/mobile/applicant";
import { loadApplicant } from "@/lib/mobile/firestore";
import { jsonError, readJson, requireMobile, serverError } from "@/lib/mobile/http";

export const dynamic = "force-dynamic";

const UPLOAD_URL_EXPIRY_MS = 15 * 60 * 1000;
const MAX_BYTES = 200 * 1024 * 1024;

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  const body = await readJson(req);
  const contentType = typeof body.content_type === "string" ? body.content_type.trim().toLowerCase() : "video/mp4";
  const size = typeof body.size_bytes === "number" ? body.size_bytes : 0;
  const filename = (typeof body.filename === "string" && body.filename.trim() ? body.filename : "video.mp4")
    .replace(/[^\w.\-]/g, "_")
    .slice(-100);
  if (!/^video\/(mp4|quicktime|webm|3gpp|x-m4v)$/.test(contentType)) {
    return jsonError("Only MP4, MOV or WebM videos are accepted.", 400);
  }
  if (size > MAX_BYTES) return jsonError("That video is over 200MB. Film a shorter one.", 400);
  try {
    const { app: fbApp, db } = getFirebaseAdmin();
    const a = await loadApplicant(db, claims.sub);
    if (!a) return jsonError("There's no application on this email.", 403);
    const problem = videoProblem(a.app, { nowMs: Date.now(), sessionClosesAtMs: a.sessionClosesAtMs, sessionOpen: a.sessionOpen });
    if (problem) return jsonError(problem, 409);
    const uploadId = `${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
    const objectPath = `careers-applications/pending/${uploadId}/${filename}`;
    const [uploadUrl] = await getStorage(fbApp)
      .bucket(STORAGE_BUCKET)
      .file(objectPath)
      .getSignedUrl({ version: "v4", action: "write", expires: Date.now() + UPLOAD_URL_EXPIRY_MS, contentType });
    return Response.json({ upload_url: uploadUrl, object_path: objectPath });
  } catch (e) {
    return serverError(e, "applicant/video/upload-url");
  }
}
