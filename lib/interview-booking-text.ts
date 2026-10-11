// Booking confirmation text, run by the every-minute reminders cron
// (app/api/interview/reminders):
//
//   "Hi {first}, this is McKenzie, creator coordinator at KESHAH. Thanks for
//    applying, you're booked for the group interview on {Thursday at 6:00 PM CT}.
//    Reply with your full name to confirm your spot."
//
// Goes out 3 to 30 min after the Calendly webhook records the booking
// (booked_at), once per booked start, and only when the interview is 90+ min
// away (sooner bookings are covered by the 1h / start texts). Bookings
// recorded more than 30 min ago never qualify, so nobody who booked before
// this shipped gets one. See bookingTextDue in interview-reminders.ts.
//
// Idempotency: claimed in a transaction first (interview_booking_text_for =
// start, interview_booking_text_claimed_at), so overlapping runs can't double
// send. If the send fails the claim is removed and the next run retries while
// the 30 min window is open. interview_booking_text_sent_at is written once it
// actually went out. A reschedule changes the start, so it gets a fresh one.
// A name reply to it is handled by the inbox sync (handleCheckIn).

import { FieldValue, Timestamp, type DocumentReference, type Firestore } from "firebase-admin/firestore";
import { APPLICATIONS, claimOnce } from "./interview";
import {
  BOOKING_TEXT_CLAIMED_FIELD,
  BOOKING_TEXT_FOR_FIELD,
  BOOKING_TEXT_MAX_AGE_MS,
  BOOKING_TEXT_SENT_FIELD,
  bookingText,
  bookingTextDue,
  firstNameOf,
  formatDayAndTime, formatLocalDayAndTime,
} from "./interview-reminders";
import { normalizePhone, sendInterviewText, textWasSent } from "./sms";

async function releaseBookingClaim(ref: DocumentReference): Promise<void> {
  await ref.update({ [BOOKING_TEXT_FOR_FIELD]: FieldValue.delete(), [BOOKING_TEXT_CLAIMED_FIELD]: FieldValue.delete() });
}

export async function sendBookingTexts(
  db: Firestore,
  nowMs: number,
  opts: { dry?: boolean; send?: typeof sendInterviewText } = {},
): Promise<{ report: Array<Record<string, unknown>>; errors: string[] }> {
  const send = opts.send ?? sendInterviewText;
  const report: Array<Record<string, unknown>> = [];
  const errors: string[] = [];
  // Single-field range on booked_at (no composite index needed). The extra
  // minute covers clock skew; bookingTextDue applies the exact window.
  const snap = await db
    .collection(APPLICATIONS)
    .where("booked_at", ">=", Timestamp.fromMillis(nowMs - BOOKING_TEXT_MAX_AGE_MS - 60 * 1000))
    .get();

  for (const d of snap.docs) {
    const x = (d.data() ?? {}) as Record<string, unknown>;
    if (!bookingTextDue(x, nowMs)) continue;
    const startIso = String(x.calendly_event_start_time);
    const startMs = Date.parse(startIso);
    const phone = normalizePhone(x.phone);
    const row: Record<string, unknown> = { id: d.id, email: String(x.email ?? "").trim(), kind: "booking", start: startIso, text_to: phone };
    report.push(row);
    if (!phone) {
      row.result = "no phone number";
      continue;
    }
    if (opts.dry) continue;

    const won = await claimOnce(db, d.ref, (cur) => {
      if (!bookingTextDue(cur, nowMs)) return null;
      return {
        [BOOKING_TEXT_FOR_FIELD]: startIso,
        [BOOKING_TEXT_CLAIMED_FIELD]: Timestamp.fromMillis(nowMs),
        // A sent marker from a booking before a reschedule mustn't count for this one.
        [BOOKING_TEXT_SENT_FIELD]: FieldValue.delete(),
      };
    });
    if (!won) {
      row.result = "already claimed";
      continue;
    }
    const text = bookingText(firstNameOf(x), formatLocalDayAndTime(startMs, x.calendly_invitee_timezone, nowMs));
    const r = await send({ to: phone, text, ref: d.id, kind: "interview_booking" });
    row.text = r;
    if (textWasSent(r)) {
      row.result = "sent";
      await d.ref.set({ [BOOKING_TEXT_SENT_FIELD]: Timestamp.now() }, { merge: true });
    } else {
      await releaseBookingClaim(d.ref).catch(() => {});
      row.result = "failed";
      if ("error" in r) errors.push(`booking text ${phone}: ${r.error}`);
    }
  }
  return { report, errors };
}
