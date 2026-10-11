// List all career applications for the admin Recruit tab. Returns
// applications ordered by most-recent activity first. Video read URLs
// are minted on demand by /api/careers/[id]/video-url — this endpoint
// only returns metadata, keeping the response small enough to fetch
// all rows in one shot.

import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { denialEmailDue } from "@/lib/interview-decisions";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db
      .collection("careers_applications")
      .orderBy("last_updated_at", "desc")
      .limit(500)
      .get();
    const rows = snap.docs.map((d) => {
      const x = d.data() as Record<string, unknown>;
      const toIso = (v: unknown) =>
        v && typeof v === "object" && "toDate" in (v as object)
          ? (v as { toDate: () => Date }).toDate().toISOString()
          : null;
      return {
        id: d.id,
        listing_slug: x.listing_slug ?? null,
        full_name: x.full_name ?? null,
        email: x.email ?? null,
        phone: x.phone ?? null,
        gender: x.gender ?? null,
        college: x.college ?? null,
        graduation_year: x.graduation_year ?? null,
        can_commit: x.can_commit ?? null,
        comfortable_on_camera: x.comfortable_on_camera ?? null,
        has_iphone: x.has_iphone ?? null,
        has_us_bank: x.has_us_bank ?? null,
        wants_virality: x.wants_virality ?? null,
        posted_before: x.posted_before ?? null,
        social_handle: x.social_handle ?? null,
        calendly_event_start_time: x.calendly_event_start_time ?? null,
        calendly_join_url: x.calendly_join_url ?? null,
        has_video: !!(typeof x.video_object_path === "string" && x.video_object_path.trim()),
        interview_session: x.interview_session ?? null,
        interview_video_submitted_at: toIso(x.interview_video_submitted_at),
        calendly_reschedule_url: x.calendly_reschedule_url ?? null,
        calendly_cancel_url: x.calendly_cancel_url ?? null,
        interview_checked_in_at: toIso(x.interview_checked_in_at),
        interview_opened_at: toIso(x.interview_opened_at),
        // Deny sends the "not moving forward" email only to people with a video.
        denial_email_due: denialEmailDue(x),
        denial_email_sent_at: toIso(x.denial_email_sent_at),
        denied_reason: x.denied_reason ?? null,
        auto_denied_at: toIso(x.auto_denied_at),
        booking_canceled_at: toIso(x.booking_canceled_at),
        booked_after_decision_start_time: x.booked_after_decision_start_time ?? null,
        phone_e164: x.phone_e164 ?? null,
        sms_opt_out_at: toIso(x.sms_opt_out_at),
        interview_possible_duplicate_id: x.interview_possible_duplicate_id ?? null,
        interview_possible_duplicate_of: Array.isArray(x.interview_possible_duplicate_of) ? x.interview_possible_duplicate_of : null,
        status: x.status ?? "pending",
        created_at: toIso(x.created_at),
        submitted_at: toIso(x.submitted_at),
        booked_at: toIso(x.booked_at),
        last_updated_at: toIso(x.last_updated_at),
        decided_at: toIso(x.decided_at),
      };
    });
    return NextResponse.json({ applications: rows });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
