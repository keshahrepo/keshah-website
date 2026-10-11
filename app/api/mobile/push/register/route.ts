// KESHAH Creators app: save this device's FCM token so we can send it pushes.
// POST (Bearer) { token, platform: "ios" | "android" } -> { ok: true }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { resolveIdentity } from "@/lib/mobile/firestore";
import { jsonError, readJson, requireMobile, serverError } from "@/lib/mobile/http";
import { firestorePushStore, registerPushToken, validPushToken } from "@/lib/push";
import { isStaffEmail } from "@/lib/staff";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  const body = await readJson(req);
  if (!validPushToken(body.token)) return jsonError("That push token doesn't look right.", 400);
  if (body.platform !== "ios" && body.platform !== "android") return jsonError("Platform must be ios or android.", 400);
  try {
    const { db } = getFirebaseAdmin();
    // Fresh lookup, so a device re-registering after acceptance is filed under the creator.
    const [id, staff] = await Promise.all([resolveIdentity(db, claims.sub), isStaffEmail(claims.sub)]);
    // Founders usually have no creator / application: file them as "staff".
    // notifyFounder (lib/staff.ts) finds their devices by email either way.
    const role = id.role === "none" && staff ? "staff" : id.role;
    await registerPushToken(
      body.token,
      { email: id.email, role, creator_id: id.creator_id ?? null, application_id: id.application_id ?? null, platform: body.platform },
      { store: firestorePushStore(db) },
    );
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "push/register");
  }
}
