// Admin: live counter for one session + open/close toggle.
// GET   -> { session, total, submitted, rows }
// PATCH { is_open } -> { ok }

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireDashboardSession } from "@/lib/support/auth";
import {
  SESSIONS,
  getSessionApplicants,
  interviewUrl,
  isoOrNull,
  resolveSession,
  sessionFromDoc,
  VIDEO_SLUG,
} from "@/lib/interview";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { slug } = await params;
    const { db } = getFirebaseAdmin();
    // The always-open video link isn't a stored session; resolve it virtually.
    const s =
      slug === VIDEO_SLUG ? await resolveSession(db, slug) : sessionFromDoc(await db.collection(SESSIONS).doc(slug).get());
    if (!s) return NextResponse.json({ error: "Session not found." }, { status: 404 });
    const docs = await getSessionApplicants(db, s);
    const rows = docs
      .map((d) => {
        const x = (d.data() ?? {}) as Record<string, unknown>;
        return {
          id: d.id,
          listing_slug: (x.listing_slug as string) ?? null,
          full_name: (x.full_name as string) ?? null,
          email: (x.email as string) ?? null,
          gender: (x.gender as string) ?? null,
          status: (x.status as string) ?? "pending",
          source: (x.source as string) ?? null,
          opened_at: isoOrNull(x.interview_opened_at),
          submitted_at: isoOrNull(x.interview_video_submitted_at),
          has_video: !!x.video_object_path && !!x.interview_video_submitted_at,
          followup_1_sent_at: isoOrNull(x.interview_followup_1_sent_at),
          followup_2_sent_at: isoOrNull(x.interview_followup_2_sent_at),
          link_closed_at: isoOrNull(x.interview_link_closed_at),
          reminder_24h_sent_at: isoOrNull(x.interview_reminder_24h_sent_at),
          reminder_1h_sent_at: isoOrNull(x.interview_reminder_1h_sent_at),
          reminder_now_sent_at: isoOrNull(x.interview_reminder_now_sent_at),
          reminder_now_text_sent_at: isoOrNull(x.interview_reminder_now_text_sent_at),
          noshow_email_sent_at: isoOrNull(x.interview_noshow_email_sent_at),
          noshow_text_sent_at: isoOrNull(x.interview_noshow_text_sent_at),
          reminder_1h_text_sent_at: isoOrNull(x.interview_reminder_1h_text_sent_at),
          // Only a check-in for the booking they have now.
          checked_in_at:
            x.interview_checked_in_for && x.interview_checked_in_for === x.calendly_event_start_time
              ? isoOrNull(x.interview_checked_in_at)
              : null,
        };
      })
      // Newest submissions first, then people who opened the page, then the rest.
      .sort((a, b) => {
        const ak = a.submitted_at ?? "";
        const bk = b.submitted_at ?? "";
        if (ak !== bk) return bk.localeCompare(ak);
        return (b.opened_at ?? "").localeCompare(a.opened_at ?? "");
      });
    return NextResponse.json({
      session: {
        slug: s.slug,
        title: s.title,
        starts_at: new Date(s.starts_at_ms).toISOString(),
        follow_up_hours: s.follow_up_hours,
        is_open: s.is_open,
        url: interviewUrl(s.slug),
      },
      total: rows.length,
      submitted: rows.filter((r) => r.submitted_at).length,
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { slug } = await params;
    const b = (await req.json()) as { is_open?: boolean };
    if (typeof b.is_open !== "boolean") {
      return NextResponse.json({ error: "is_open required" }, { status: 400 });
    }
    const { db } = getFirebaseAdmin();
    const ref = db.collection(SESSIONS).doc(slug);
    if (!(await ref.get()).exists) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }
    await ref.set({ is_open: b.is_open }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
