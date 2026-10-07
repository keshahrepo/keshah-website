// Cron (every minute, see vercel.json): pre-interview reminders for
// applicants with a Calendly booking coming up.
//
//   at the start time (0 to +2 min)    text only: "we're waiting for you" + join link
//   (Calendly already emails the 24h / 1h reminders, so we don't.)
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
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";
import { emailConfigured, sendEmail } from "@/lib/email";
import { APPLICATIONS, claimOnce, releaseClaim } from "@/lib/interview";
import {
  CREATOR_FROM_NAME,
  REMINDER_FIELDS,
  REMINDER_KINDS,
  REMINDER_LOOKAHEAD_MS,
  REMINDER_LOOKBACK_MS,
  REMINDER_NOW_TEXT_FIELD,
  REMINDER_START_FIELD,
  firstNameOf,
  formatInterviewTime,
  isReminderEligible,
  pickReminder,
  reminderEmail,
  sentReminders,
  startingNowText,
} from "@/lib/interview-reminders";
import { normalizePhone, sendInterviewText, textWasSent } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

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
      // Calendly already sends the 24h / 1h reminder emails. We only send the
      // "we're waiting for you" text at the start time.
      if (kind !== "now") continue;

      const email = String(x.email).trim();
      const first = firstNameOf(x);
      const joinUrl = (x.calendly_join_url as string) || null;
      const msg = reminderEmail(kind, {
        first,
        when: formatInterviewTime(startMs, x.calendly_invitee_timezone),
        joinUrl,
        rescheduleUrl: (x.calendly_reschedule_url as string) || null,
      });
      void msg;
      const phone = normalizePhone(x.phone);
      const row: Record<string, unknown> = { id: d.id, email, kind, start: startIso, text_to: phone };
      report.push(row);
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
        }
        return patch;
      });
      if (!won) {
        row.result = "already claimed";
        continue;
      }
      const r = await sendInterviewText({ to: phone, text: startingNowText(first, joinUrl), ref: d.id });
      row.text = r;
      if (textWasSent(r)) {
        row.result = "sent";
        await d.ref.set({ [REMINDER_NOW_TEXT_FIELD]: Timestamp.now() }, { merge: true });
      } else {
        // Not sent: free the claim so the next run (still inside the window) retries.
        await releaseClaim(d.ref, field).catch(() => {});
        row.result = "failed";
        if ("error" in r) errors.push(`now text ${phone}: ${r.error}`);
      }
    }

    return NextResponse.json({ ok: errors.length === 0, dry, email_configured: canEmail, checked: snap.size, report, errors });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, report, errors }, { status: 500 });
  }
}
