// Cron (every 30 min, see vercel.json): follow up with group-interview
// applicants who haven't sent their test video yet.
//
// For each OPEN session that started at least 30 minutes ago, for each
// applicant in it (tagged or booked into its slot) without a video:
//
// No-shows (booked into the slot, never opened this session's page) get ONE
// "sorry we missed you" email ≥ 30 min after the start, with the always-open
// /interview/video link and the presentation recording (if set in
// Settings/creator_portal.interview_recording_url), plus a text once HiBlue
// is wired up. They don't get the session-link emails below.
//
// Attendees (opened the page) without a video:
//   - ≥ 60 min after starts_at:                 first email
//   - ≥ follow_up_hours - 4h (~20h) after start: reminder email
//   - ≥ follow_up_hours (24h) after start:       link closed for them
// Once a session is past its close time it is flipped to is_open: false.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 reports what would happen without sending or writing.

import { NextResponse } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { emailConfigured, sendEmail } from "@/lib/email";
import {
  SESSIONS,
  getSessionApplicants,
  interviewUrl,
  sessionClosesAtMs,
  sessionFromDoc,
  type InterviewSession,
  SITE_URL,
  claimOnce,
  getInterviewRecordingUrl,
  releaseClaim,
} from "@/lib/interview";
import {
  ATTENDEE_FIRST_DELAY_MS,
  CREATOR_FROM_NAME,
  NOSHOW_DELAY_MS,
  NOSHOW_EMAIL_FIELD,
  NOSHOW_TEXT_FIELD,
  classifyAttendance,
  noShowEmail,
  noShowEmailDue,
  noShowText,
  videoLinkFor,
} from "@/lib/interview-reminders";
import { normalizePhone, sendInterviewText, textWasSent } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOUR = 60 * 60 * 1000;
const FIRST_EMAIL_DELAY_MS = ATTENDEE_FIRST_DELAY_MS;
const REMINDER_BEFORE_CLOSE_MS = 4 * HOUR;

function linkFor(s: InterviewSession, email: string): string {
  return `${interviewUrl(s.slug)}?email=${encodeURIComponent(email)}`;
}

function hoursLeft(s: InterviewSession, now: number): number {
  return Math.max(1, Math.round((sessionClosesAtMs(s) - now) / HOUR));
}

function firstEmail(first: string, link: string, hrs: number) {
  return {
    subject: "Your KESHAH test video",
    text:
      `Hi ${first},\n\n` +
      `Thanks for joining the group interview today. We haven't got your test video yet.\n\n` +
      `It only takes a few minutes. Open this link on your phone, watch the example, then film yourself saying the short script:\n` +
      `${link}\n\n` +
      `The link stays open for about ${hrs} more hours.\n\n` +
      `Thanks,\nAadi\nFounder, KESHAH`,
  };
}

function reminderEmail(first: string, link: string, hrs: number) {
  return {
    subject: "Reminder: your KESHAH test video",
    text:
      `Hi ${first},\n\n` +
      `Just a reminder, we still haven't got your test video, and the link closes in about ${hrs} ${hrs === 1 ? "hour" : "hours"}.\n\n` +
      `Here it is again:\n${link}\n\n` +
      `If you've already sent it, you can ignore this.\n\n` +
      `Thanks,\nAadi\nFounder, KESHAH`,
  };
}

export async function GET(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const canEmail = emailConfigured();
  const now = Date.now();
  const report: Array<Record<string, unknown>> = [];
  const errors: string[] = [];

  try {
    const { db } = getFirebaseAdmin();
    const snap = await db
      .collection(SESSIONS)
      .where("is_open", "==", true)
      .get();

    let recordingUrl: string | null | undefined;

    for (const d of snap.docs) {
      const s = sessionFromDoc(d);
      if (!s || !s.starts_at_ms) continue;
      if (now < s.starts_at_ms + NOSHOW_DELAY_MS) continue;

      const closesAt = sessionClosesAtMs(s);
      const reminderAt = closesAt - REMINDER_BEFORE_CLOSE_MS;
      const counts = { first: 0, reminder: 0, closed: 0, skipped: 0, no_show: 0, no_show_text: 0 };

      const applicants = await getSessionApplicants(db, s);
      for (const a of applicants) {
        const x = (a.data() ?? {}) as Record<string, unknown>;
        if (x.interview_video_submitted_at) continue;
        if (x.status === "denied" || x.status === "accepted") {
          counts.skipped++;
          continue;
        }
        const email = String(x.email ?? "").trim();
        const first = String(x.full_name ?? "").trim().split(/\s+/)[0] || "there";
        const base: Record<string, unknown> = { interview_session: s.slug };

        if (now >= closesAt) {
          // No-shows were sent the always-open video link, which never closes.
          if (!x.interview_link_closed_at && classifyAttendance(x, s) !== "no_show") {
            counts.closed++;
            if (!dry) {
              await a.ref.set(
                { ...base, interview_link_closed_at: FieldValue.serverTimestamp() },
                { merge: true },
              );
            }
          }
          continue;
        }

        if (!email) {
          counts.skipped++;
          continue;
        }

        if (classifyAttendance(x, s) === "no_show") {
          if (!noShowEmailDue(x, { starts_at_ms: s.starts_at_ms, closes_at_ms: closesAt }, now)) continue;
          counts.no_show++;
          const phone = normalizePhone(x.phone);
          if (dry) {
            if (phone) counts.no_show_text++;
            continue;
          }
          if (!canEmail) {
            errors.push(`email not configured; skipped no-show email to ${email}`);
            continue;
          }
          if (recordingUrl === undefined) recordingUrl = await getInterviewRecordingUrl(db);
          const link = videoLinkFor(SITE_URL, email);
          const won = await claimOnce(db, a.ref, (cur) =>
            cur[NOSHOW_EMAIL_FIELD] || cur.interview_followup_1_sent_at || cur.interview_followup_2_sent_at
              ? null
              : { [NOSHOW_EMAIL_FIELD]: Timestamp.now() },
          );
          if (!won) continue;
          try {
            await sendEmail({
              to: email,
              fromName: CREATOR_FROM_NAME,
              ...noShowEmail({ first, link, recordingUrl }),
            });
          } catch (e) {
            await releaseClaim(a.ref, NOSHOW_EMAIL_FIELD).catch(() => {});
            errors.push(`${s.slug} no-show ${email}: ${e instanceof Error ? e.message : String(e)}`);
            continue;
          }
          if (phone && !x[NOSHOW_TEXT_FIELD]) {
            const r = await sendInterviewText({ to: phone, text: noShowText(first, link, !!x.interview_reminder_now_text_sent_at), ref: a.id });
            if (textWasSent(r)) {
              counts.no_show_text++;
              await a.ref.set({ [NOSHOW_TEXT_FIELD]: Timestamp.now() }, { merge: true });
            } else if ("error" in r) {
              errors.push(`${s.slug} no-show text ${phone}: ${r.error}`);
            }
          }
          continue;
        }

        if (now < s.starts_at_ms + FIRST_EMAIL_DELAY_MS) continue;

        let kind: "first" | "reminder" | null = null;
        if (now >= reminderAt && !x.interview_followup_2_sent_at) kind = "reminder";
        else if (!x.interview_followup_1_sent_at && !x.interview_followup_2_sent_at) kind = "first";
        if (!kind) continue;

        const msg =
          kind === "first"
            ? firstEmail(first, linkFor(s, email), hoursLeft(s, now))
            : reminderEmail(first, linkFor(s, email), hoursLeft(s, now));
        counts[kind]++;
        if (dry) continue;
        if (!canEmail) {
          errors.push(`email not configured; skipped ${kind} to ${email}`);
          continue;
        }
        try {
          await sendEmail({ to: email, ...msg });
          await a.ref.set(
            {
              ...base,
              [kind === "first" ? "interview_followup_1_sent_at" : "interview_followup_2_sent_at"]:
                Timestamp.now(),
            },
            { merge: true },
          );
        } catch (e) {
          errors.push(`${s.slug} ${email}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      if (now >= closesAt && !dry) {
        await d.ref.set({ is_open: false, closed_at: FieldValue.serverTimestamp() }, { merge: true });
      }
      report.push({ slug: s.slug, applicants: applicants.length, ...counts });
    }

    return NextResponse.json({ ok: errors.length === 0, dry, email_configured: canEmail, report, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, report, errors }, { status: 500 });
  }
}
