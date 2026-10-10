// Cron (every minute, see vercel.json): pre-interview reminders for
// applicants with a Calendly booking coming up.
//
//   3 to 30 min after booking           booking text: "reply with your full name to confirm your spot"
//                                       (only bookings recorded in the last 30 min, interview 90+ min away;
//                                       lib/interview-booking-text.ts)
//   59 to 61 min before                 text only, with the link (+ "reply with your full name to
//                                       confirm" if they haven't confirmed yet)
//   at the start time (0 to +2 min)    text only: "we're waiting for you" + join link
//   (Calendly already emails the 24h / 1h reminders, so we don't.)
//   Both also go as a push to the KESHAH Creators app when the applicant has
//   it installed (once per booking, mobile_push_<kind>_for = start).
// A name reply to the booking text confirms them (and gets the join link
// back); one to the 1h text checks them in (handled by the inbox sync,
// lib/applicant-inbox-firestore.ts).
//
// Every 5 minutes it also makes sure each Calendly booking in the next 48h
// has its interview session (ensureSessionsForBookings; the webhook normally
// already made it).
//
// After that it syncs applicant text replies into the dashboard inbox
// (lib/applicant-inbox-firestore.ts). A sync failure is reported under
// `inbox` and never breaks the reminders.
//
// Each goes out at most once per booking. The send is claimed first inside
// a transaction (interview_reminder_<kind>_sent_at), so overlapping runs
// can't double send; if the text fails the claim is removed and the next
// run retries while the window is still open. Markers are tied to the
// booked start (interview_reminders_start), so a reschedule starts fresh.
//
// Auth: Vercel cron sends Authorization: Bearer ${CRON_SECRET}.
// GET ?dry=1 reports what would be sent without sending or writing.

import { NextResponse } from "next/server";
import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { emailConfigured, sendEmail } from "@/lib/email";
import { APPLICATIONS, claimOnce, ensureSessionsForBookings, releaseClaim } from "@/lib/interview";
import { autoEnsureDue } from "@/lib/interview-auto";
import {
  CREATOR_FROM_NAME,
  REMINDER_FIELDS,
  REMINDER_KINDS,
  REMINDER_LOOKAHEAD_MS,
  REMINDER_LOOKBACK_MS,
  REMINDER_1H_TEXT_FIELD,
  REMINDER_NOW_TEXT_FIELD,
  REMINDER_START_FIELD,
  firstNameOf,
  formatShortTime,
  confirmedForBooking,
  got1hText,
  gotBookingText,
  isReminderEligible,
  oneHourText,
  pickReminder,
  sentReminders,
  startingNowText,
} from "@/lib/interview-reminders";
import { normalizePhone, sendInterviewText, textWasSent } from "@/lib/sms";
import { runApplicantInboxSync } from "@/lib/applicant-inbox-firestore";
import { sendBookingTexts } from "@/lib/interview-booking-text";
import { notify, PUSH_COPY } from "@/lib/push";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PUSH_FIELDS = { "1h": "mobile_push_1h_for", now: "mobile_push_now_for" } as const;

/** Push the 1h / start reminder to the applicant's devices once per booking. Never throws. */
async function pushReminder(
  db: Firestore,
  ref: DocumentReference,
  applicationId: string,
  email: string,
  kind: "1h" | "now",
  startIso: string,
): Promise<string> {
  const field = PUSH_FIELDS[kind];
  try {
    const won = await claimOnce(db, ref, (cur) => (cur[field] === startIso ? null : { [field]: startIso }));
    if (!won) return "already sent";
    const r = await notify({ applicationId, email }, kind === "1h" ? PUSH_COPY.interview1h : PUSH_COPY.interviewNow);
    if (!r || r.sent === 0) {
      // No device (or it failed): free the marker so a later run in the window can try again.
      await releaseClaim(ref, field).catch(() => {});
      return r ? "no devices" : "failed";
    }
    return "sent";
  } catch (e) {
    console.error("interview reminder push failed:", e instanceof Error ? e.message : e);
    return "failed";
  }
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
    // calendly_event_start_time is an ISO string, so a lexical range works.
    const lo = new Date(now - REMINDER_LOOKBACK_MS - 60 * 1000).toISOString();
    const hi = new Date(now + REMINDER_LOOKAHEAD_MS + 60 * 1000).toISOString();
    const snap = await db
      .collection(APPLICATIONS)
      .where("calendly_event_start_time", ">=", lo)
      .where("calendly_event_start_time", "<=", hi)
      .get();

    for (const d of snap.docs) {
      const x = (d.data() ?? {}) as Record<string, unknown>;
      if (!isReminderEligible(x)) continue;
      const startIso = String(x.calendly_event_start_time);
      const startMs = Date.parse(startIso);
      const kind = pickReminder(startMs, now, sentReminders(x, startIso));
      // Calendly already sends the 24h / 1h reminder emails. We send two
      // texts: the 1h check-in text and the "we're waiting for you" text at
      // the start time.
      if (kind !== "now" && kind !== "1h") continue;

      const email = String(x.email).trim();
      const first = firstNameOf(x);
      const joinUrl = (x.calendly_join_url as string) || null;
      const phone = normalizePhone(x.phone);
      const row: Record<string, unknown> = { id: d.id, email, kind, start: startIso, text_to: phone };
      report.push(row);
      // App push (KESHAH Creators), alongside the text. Its own once-per-booking
      // marker, and it never affects the text below.
      if (!dry) row.push = await pushReminder(db, d.ref, d.id, email, kind, startIso);
      if (!phone) {
        row.result = "no phone number";
        continue;
      }
      if (dry) continue;

      const field = REMINDER_FIELDS[kind];
      const won = await claimOnce(db, d.ref, (cur) => {
        if (sentReminders(cur, startIso).has(kind)) return null;
        const patch: Record<string, unknown> = { [field]: Timestamp.now(), [REMINDER_START_FIELD]: startIso };
        // Markers left over from a booking before a reschedule: clear them.
        if (cur[REMINDER_START_FIELD] !== undefined && cur[REMINDER_START_FIELD] !== startIso) {
          for (const k of REMINDER_KINDS) if (k !== kind) patch[REMINDER_FIELDS[k]] = FieldValue.delete();
          patch[REMINDER_NOW_TEXT_FIELD] = FieldValue.delete();
          patch[REMINDER_1H_TEXT_FIELD] = FieldValue.delete();
        }
        return patch;
      });
      if (!won) {
        row.result = "already claimed";
        continue;
      }
      const text =
        kind === "1h"
          ? oneHourText(first, formatShortTime(startMs, x.calendly_invitee_timezone), joinUrl, {
              confirmed: confirmedForBooking(x, startIso),
              introduced: gotBookingText(x, startIso),
            })
          : startingNowText(first, joinUrl, got1hText(x, startIso) || gotBookingText(x, startIso));
      const r = await sendInterviewText({ to: phone, text, ref: d.id, kind: kind === "1h" ? "interview_1h" : "interview_start" });
      row.text = r;
      if (textWasSent(r)) {
        row.result = "sent";
        await d.ref.set({ [kind === "1h" ? REMINDER_1H_TEXT_FIELD : REMINDER_NOW_TEXT_FIELD]: Timestamp.now() }, { merge: true });
      } else {
        // Not sent: free the claim so the next run (still inside the window) retries.
        await releaseClaim(d.ref, field).catch(() => {});
        row.result = "failed";
        if ("error" in r) errors.push(`${kind} text ${phone}: ${r.error}`);
      }
    }

    // Booking confirmation texts (a few minutes after someone books).
    try {
      const b = await sendBookingTexts(db, now, { dry });
      report.push(...b.report);
      errors.push(...b.errors);
    } catch (e) {
      errors.push(`booking texts: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Safety net for automatic interview sessions (the Calendly webhook makes
    // them as bookings come in): every 5 minutes, or ?ensure=1. Can never
    // fail the reminders.
    let sessions: Record<string, unknown> | null = null;
    if (autoEnsureDue(now) || new URL(req.url).searchParams.get("ensure") === "1") {
      try {
        sessions = await ensureSessionsForBookings(db, now, dry);
      } catch (e) {
        sessions = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    // Applicant text inbox: pull new replies in and email contact@. Runs
    // after the reminders and can never fail them.
    let inbox: Record<string, unknown> | null = null;
    if (!dry) {
      try {
        const r = await runApplicantInboxSync(db);
        inbox = { scanned: r.scanned, matched: r.matched, created: r.created, notified: r.notified, errors: r.errors };
      } catch (e) {
        inbox = { error: e instanceof Error ? e.message : String(e) };
      }
    }

    return NextResponse.json({ ok: errors.length === 0, dry, email_configured: canEmail, checked: snap.size, report, errors, sessions, inbox });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, report, errors }, { status: 500 });
  }
}
