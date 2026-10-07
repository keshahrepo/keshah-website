// KESHAH Creators app: mark an onboarding screen done.
// POST (Bearer) { step: "applicant_intro" | "creator_intro" | "pledge" | "plan_seen" } -> { ok: true }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { resolveIdentity } from "@/lib/mobile/firestore";
import { jsonError, readJson, requireMobile, serverError } from "@/lib/mobile/http";
import { isMobileStep, markMobileStep } from "@/lib/mobile/onboarding";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  const body = await readJson(req);
  if (!isMobileStep(body.step)) return jsonError("Unknown step.", 400);
  try {
    const { db } = getFirebaseAdmin();
    const id = await resolveIdentity(db, claims.sub);
    const problem = await markMobileStep(db, id, body.step);
    if (problem) return jsonError(problem, 403);
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "me/onboarding");
  }
}
