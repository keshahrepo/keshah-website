// Public: final step of /interview/[slug]. The video is already in
// Firebase Storage (uploaded straight from the phone via
// /api/careers/upload-url); this just records it on the application.
// POST { slug, email, video_object_path, video_original_name?, video_size_bytes?, consent }

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { findApplicationByEmail, isAcceptingNow, notifyFounderVideoSent, resolveSession } from "@/lib/interview";

type Body = {
  slug?: string;
  email?: string;
  video_object_path?: string;
  video_original_name?: string;
  video_size_bytes?: number;
  consent?: boolean;
};

export async function POST(req: Request) {
  try {
    const b = (await req.json()) as Body;
    const path = (b.video_object_path ?? "").trim();
    if (!path.startsWith("careers-applications/")) {
      return NextResponse.json({ error: "Missing video." }, { status: 400 });
    }
    if (b.consent !== true) {
      return NextResponse.json({ error: "Please tick the box first." }, { status: 400 });
    }
    const { db } = getFirebaseAdmin();
    const session = await resolveSession(db, b.slug ?? "");
    if (!session || !isAcceptingNow(session)) {
      return NextResponse.json({ closed: true });
    }
    const doc = await findApplicationByEmail(db, b.email ?? "");
    if (!doc) {
      return NextResponse.json(
        { error: "We couldn't find your application. Go back and enter your email again." },
        { status: 404 },
      );
    }
    const now = FieldValue.serverTimestamp();
    await doc.ref.set(
      {
        interview_session: session.slug,
        interview_video_submitted_at: now,
        video_object_path: path,
        video_original_name: (b.video_original_name ?? "").slice(0, 200) || null,
        video_size_bytes: typeof b.video_size_bytes === "number" ? b.video_size_bytes : null,
        consent: true,
        last_updated_at: now,
      },
      { merge: true },
    );
    // First video only (a re-upload doesn't push again).
    if (!doc.get("interview_video_submitted_at")) await notifyFounderVideoSent(doc.id, doc.get("full_name"));
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
