// KESHAH Creators app: Continue with Google / Apple.
// POST { id_token } (Firebase ID token, project keshah-app)
//   -> { token, role, name, email, creator_id?, application_id? }
//   or { needs_link: true, link_token } when we need the email they applied
//      with (Apple private relay, or an email we don't know). Then:
//      /api/mobile/auth/link/start and /api/mobile/auth/link/verify.
// 401 for an invalid ID token.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { firebaseSignIn } from "@/lib/mobile/firebase-signin";
import { firestoreIdentity, firestoreLinkStore } from "@/lib/mobile/firestore";
import { jsonError, mobileOff, readJson, serverError } from "@/lib/mobile/http";
import { mobileAuthConfigured } from "@/lib/mobile/token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mobileAuthConfigured()) return mobileOff();
  const body = await readJson(req);
  try {
    const { auth, db } = getFirebaseAdmin();
    const r = await firebaseSignIn(
      {
        verifyIdToken: (t) => auth.verifyIdToken(t),
        links: firestoreLinkStore(db),
        identity: firestoreIdentity(db),
      },
      body.id_token,
    );
    if (!r.ok) return jsonError(r.error, r.status);
    return Response.json(r.body);
  } catch (e) {
    return serverError(e, "auth/firebase");
  }
}
