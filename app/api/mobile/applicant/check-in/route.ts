// KESHAH Creators app: check in for the group interview (same effect as
// replying to the 1h text). Open from 70 min before the start until 30 min after.
// POST (Bearer) -> { ok: true, join_url }

import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { claimOnce } from "@/lib/interview";
import { CHECKED_IN_FIELD, CHECKED_IN_FOR_FIELD } from "@/lib/interview-reminders";
import { checkedInForBooking, checkInWindow } from "@/lib/mobile/applicant";
import { loadApplicant } from "@/lib/mobile/firestore";
import { jsonError, requireMobile, serverError } from "@/lib/mobile/http";

export const dynamic = "force-dynamic";

const WINDOW_ERRORS = {
  no_booking: { error: "You don't have a group interview booked.", status: 404 },
  too_early: { error: "Check-in opens about an hour before your interview.", status: 409 },
  too_late: { error: "This interview has already ended.", status: 409 },
} as const;

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  try {
    const { db } = getFirebaseAdmin();
    const a = await loadApplicant(db, claims.sub);
    if (!a) return jsonError("There's no application on this email.", 403);
    let blocked: keyof typeof WINDOW_ERRORS | null = null;
    let joinUrl: string | null = null;
    await claimOnce(db, a.doc.ref, (cur) => {
      const w = checkInWindow(cur, Date.now());
      if (w !== "open") {
        blocked = w;
        return null;
      }
      joinUrl = (cur.calendly_join_url as string) || null;
      if (checkedInForBooking(cur)) return null; // already checked in: fine, just hand back the link
      return {
        [CHECKED_IN_FIELD]: Timestamp.now(),
        [CHECKED_IN_FOR_FIELD]: cur.calendly_event_start_time,
        interview_checkin_source: "app",
      };
    });
    if (blocked) {
      const e = WINDOW_ERRORS[blocked as keyof typeof WINDOW_ERRORS];
      return jsonError(e.error, e.status);
    }
    return Response.json({ ok: true, join_url: joinUrl });
  } catch (e) {
    return serverError(e, "applicant/check-in");
  }
}
