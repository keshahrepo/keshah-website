// List all career applications for the admin Recruit tab. Returns
// applications ordered by most-recent activity first. Video read URLs
// are minted on demand by /api/careers/[id]/video-url — this endpoint
// only returns metadata, keeping the response small enough to fetch
// all rows in one shot.

import { NextResponse } from "next/server";
import { requireDashboardSession } from "@/lib/support/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { denialEmailDue } from "@/lib/interview-decisions";
import { recruitStage, type CreatorLite } from "@/lib/outreach";
import { QUEUE, QUEUE_DEFAULT_CAP } from "@/lib/outreach-db";
import { easternNow } from "@/lib/outreach-nudges";
import { warningsOf } from "@/lib/outreach-health";

export const dynamic = "force-dynamic";

/** The Recruit header: today's first emails against the daily cap, what's queued, and totals. */
async function outreachStats(db: FirebaseFirestore.Firestore) {
  const [queued, sent, settings] = await Promise.all([
    db.collection(QUEUE).where("status", "==", "queued").count().get(),
    db.collection(QUEUE).where("status", "==", "sent").get(),
    db.collection("Settings").doc("outreach_daily").get(),
  ]);
  const today = easternNow().date;
  const sentAt = sent.docs.map((d) => String(d.get("sent_at") ?? ""));
  const cap = typeof settings.get("cap") === "number" ? settings.get("cap") : QUEUE_DEFAULT_CAP;
  return {
    queued: queued.data().count,
    sent_today: sentAt.filter((s) => s && easternNow(new Date(s)).date === today).length,
    sent_total: sentAt.length,
    cap,
    paused: settings.get("paused") === true,
    warnings: warningsOf({ health: settings.get("health") ?? {}, paused: settings.get("paused") === true, queued: queued.data().count, sentToday: sentAt.filter((s) => s && easternNow(new Date(s)).date === today).length, cap, now: new Date() }),
  };
}

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
    // The creator each accepted application became, for Offered / Onboarding / Posting.
    const creators = new Map<string, CreatorLite>();
    const cs = await db.collection("ContentCreators").select("application_id", "status", "start_date", "contract").get();
    for (const c of cs.docs) {
      const appId = c.get("application_id");
      if (typeof appId !== "string" || !appId) continue;
      creators.set(appId, {
        contract_signed: c.get("contract")?.status === "signed",
        started: typeof c.get("start_date") === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.get("start_date")),
        status: String(c.get("status") ?? ""),
      });
    }
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
        outside_us_timezone: x.outside_us_timezone ?? null,
        graduation_year: x.graduation_year ?? null,
        can_commit: x.can_commit ?? null,
        comfortable_on_camera: x.comfortable_on_camera ?? null,
        has_iphone: x.has_iphone ?? null,
        has_us_bank: x.has_us_bank ?? null,
        wants_virality: x.wants_virality ?? null,
        posted_before: x.posted_before ?? null,
        social_handle: x.social_handle ?? null,
        // Where they came from ("tiktok-outreach" for creators we emailed).
        source: x.source ?? null,
        note: x.note ?? null,
        // Outreach pipeline (lib/outreach.ts): stage, their TikTok, our email and their reply.
        stage: recruitStage(x, creators.get(d.id) ?? null),
        followers: typeof x.followers === "number" ? x.followers : null,
        outreach_video_line: x.outreach_video_line ?? null,
        emailed_at: x.emailed_at ?? null,
        replied_at: x.replied_at ?? null,
        reply_snippet: x.reply_snippet ?? null,
        calendar_sent_at: x.calendar_sent_at ?? null,
        // 48-hour follow-ups (lib/outreach-nudges.ts).
        nudge_noreply_sent_at: x.nudge_noreply_sent_at ?? null,
        nudge_calendar_sent_at: x.nudge_calendar_sent_at ?? null,
        // Research on their TikTok (fit, what to mention, watch-outs, questions).
        research_notes: x.research_notes && typeof x.research_notes === "object" ? x.research_notes : null,
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
    return NextResponse.json({ applications: rows, outreach: await outreachStats(db) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
