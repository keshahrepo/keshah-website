// KESHAH Creators app: the applicant's home screen.
// GET (Bearer) -> { status, name, booking_url, interview: null | {...}, video_submitted }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { applicantStatus, bookingUrl, interviewCard, videoSubmitted } from "@/lib/mobile/applicant";
import { loadApplicant } from "@/lib/mobile/firestore";
import { jsonError, requireMobile, serverError } from "@/lib/mobile/http";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  try {
    const { db } = getFirebaseAdmin();
    const a = await loadApplicant(db, claims.sub);
    if (!a) return jsonError("There's no application on this email.", 403);
    const ctx = { nowMs: Date.now(), sessionClosesAtMs: a.sessionClosesAtMs, sessionOpen: a.sessionOpen };
    return Response.json({
      status: applicantStatus(a.app, ctx),
      name: String(a.app.full_name ?? "").trim(),
      booking_url: bookingUrl(),
      interview: interviewCard(a.app, ctx),
      video_submitted: videoSubmitted(a.app),
    });
  } catch (e) {
    return serverError(e, "applicant");
  }
}
