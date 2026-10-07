// KESHAH Creators app: record the uploaded test video on the application.
// Same fields as /api/interview/submit. interview_session = their session
// slug, else "video". Refused once their deadline has passed.
// POST (Bearer) { object_path, consent? } -> { ok: true }

import { FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { STORAGE_BUCKET } from "@/lib/creators/db";
import { videoProblem } from "@/lib/mobile/applicant";
import { loadApplicant } from "@/lib/mobile/firestore";
import { jsonError, readJson, requireMobile, serverError } from "@/lib/mobile/http";

export const dynamic = "force-dynamic";

const PATH_RE = /^careers-applications\/pending\/[a-z0-9]+_[a-f0-9]{12}\/[\w.\-]{1,100}$/;

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  const body = await readJson(req);
  const path = typeof body.object_path === "string" ? body.object_path.trim() : "";
  if (!PATH_RE.test(path)) return jsonError("Missing video. Upload it first.", 400);
  try {
    const { app: fbApp, db } = getFirebaseAdmin();
    const a = await loadApplicant(db, claims.sub);
    if (!a) return jsonError("There's no application on this email.", 403);
    const problem = videoProblem(a.app, { nowMs: Date.now(), sessionClosesAtMs: a.sessionClosesAtMs, sessionOpen: a.sessionOpen });
    if (problem) return jsonError(problem, 409);
    const file = getStorage(fbApp).bucket(STORAGE_BUCKET).file(path);
    const [exists] = await file.exists();
    if (!exists) return jsonError("We couldn't find your video. Try uploading it again.", 400);
    const [meta] = await file.getMetadata().catch(() => [null]);
    const size = meta?.size !== undefined ? Number(meta.size) : null;
    const now = FieldValue.serverTimestamp();
    await a.doc.ref.set(
      {
        interview_session: a.sessionSlug,
        interview_video_submitted_at: now,
        video_object_path: path,
        video_original_name: path.split("/").pop()?.slice(0, 200) || null,
        video_size_bytes: Number.isFinite(size) ? size : null,
        // The web page makes them tick a consent box; the app sends consent: true after its own.
        consent: body.consent === true ? true : null,
        video_submitted_via: "app",
        last_updated_at: now,
      },
      { merge: true },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "applicant/video/submit");
  }
}
