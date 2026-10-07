// Admin: group-interview settings (Applications sessions panel).
// GET -> { interview_recording_url }
// PUT { interview_recording_url } -> { ok, interview_recording_url }
// Stored on Settings/creator_portal.interview_recording_url. Empty clears it.

import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import { PORTAL_SETTINGS, RECORDING_URL_FIELD, getInterviewRecordingUrl } from "@/lib/interview";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { db } = getFirebaseAdmin();
    return NextResponse.json({ interview_recording_url: (await getInterviewRecordingUrl(db)) ?? "" });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const b = (await req.json().catch(() => ({}))) as { interview_recording_url?: unknown };
    const raw = typeof b.interview_recording_url === "string" ? b.interview_recording_url.trim() : "";
    if (raw) {
      let ok = false;
      try {
        ok = new URL(raw).protocol === "https:";
      } catch {
        ok = false;
      }
      if (!ok) return NextResponse.json({ error: "Use a full https:// link." }, { status: 400 });
    }
    const { db } = getFirebaseAdmin();
    await db
      .collection(PORTAL_SETTINGS.collection)
      .doc(PORTAL_SETTINGS.doc)
      .set({ [RECORDING_URL_FIELD]: raw || FieldValue.delete(), updated_at: new Date().toISOString() }, { merge: true });
    return NextResponse.json({ ok: true, interview_recording_url: raw });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
