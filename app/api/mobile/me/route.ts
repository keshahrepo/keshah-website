// KESHAH Creators app: who am I, re-checked on every call (an applicant who
// gets accepted shows up as a creator without signing in again).
// GET (Bearer) [?tz=America/Los_Angeles, the phone's zone] -> { role, name, email, creator_id?, application_id?, onboarding: {...}, staff }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { resolveIdentity } from "@/lib/mobile/firestore";
import { requireMobile, serverError } from "@/lib/mobile/http";
import { readMobileOnboarding } from "@/lib/mobile/onboarding";
import { isStaffEmail } from "@/lib/staff";
import { recordAppSeen } from "@/lib/mobile/app-seen";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  try {
    const { db } = getFirebaseAdmin();
    const id = await resolveIdentity(db, claims.sub);
    const [onboarding, staff] = await Promise.all([
      readMobileOnboarding(db, id),
      isStaffEmail(claims.sub),
      // Founder's Progress timeline: "Signed in to the app" (best effort, never fails the call).
      id.role === "creator" && id.creator_id
        ? recordAppSeen(db, id.creator_id, new Date(), new URL(req.url).searchParams.get("tz")).catch((e) => console.error("me: app seen stamp failed:", e))
        : null,
    ]);
    // staff: the founder side of the app (lib/staff.ts).
    return Response.json({ ...id, onboarding, staff });
  } catch (e) {
    return serverError(e, "me");
  }
}
