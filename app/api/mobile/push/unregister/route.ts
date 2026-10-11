// KESHAH Creators app: forget this device's FCM token (sign-out), so the next
// account on the phone doesn't get the previous one's pushes.
// POST (Bearer) { token } -> { ok: true }   (also ok when the token was already gone)

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { jsonError, readJson, requireMobile, serverError } from "@/lib/mobile/http";
import { unregisterPushToken, firestorePushStore, validPushToken } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const claims = await requireMobile(req);
  if (claims instanceof Response) return claims;
  const body = await readJson(req);
  if (!validPushToken(body.token)) return jsonError("That push token doesn't look right.", 400);
  try {
    const { db } = getFirebaseAdmin();
    await unregisterPushToken(body.token, claims.sub, { store: firestorePushStore(db) });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "push/unregister");
  }
}
