// KESHAH Creators app: who am I, re-checked on every call (an applicant who
// gets accepted shows up as a creator without signing in again).
// GET (Bearer) -> { role, name, email, creator_id?, application_id?, onboarding: {...}, staff }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { resolveIdentity } from "@/lib/mobile/firestore";
import { requireMobile, serverError } from "@/lib/mobile/http";
import { readMobileOnboarding } from "@/lib/mobile/onboarding";
import { isStaffEmail } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  try {
    const { db } = getFirebaseAdmin();
    const id = await resolveIdentity(db, claims.sub);
    const [onboarding, staff] = await Promise.all([readMobileOnboarding(db, id), isStaffEmail(claims.sub)]);
    // staff: the founder side of the app (lib/staff.ts).
    return Response.json({ ...id, onboarding, staff });
  } catch (e) {
    return serverError(e, "me");
  }
}
