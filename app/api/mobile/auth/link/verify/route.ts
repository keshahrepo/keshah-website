// KESHAH Creators app: check the code, link the Firebase account to that
// email (mobile_identity_links/{uid}) and sign in as it.
// POST { link_token, email, code } -> { token, role, name, email, creator_id?, application_id? }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { checkError, verifyCode } from "@/lib/mobile/codes";
import { completeLink } from "@/lib/mobile/firebase-signin";
import { firestoreCodeStore, firestoreIdentity, firestoreLinkStore } from "@/lib/mobile/firestore";
import { jsonError, mobileOff, readJson, serverError } from "@/lib/mobile/http";
import { mobileAuthConfigured, normalizeEmail, verifyLinkToken } from "@/lib/mobile/token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mobileAuthConfigured()) return mobileOff();
  const body = await readJson(req);
  const uid = await verifyLinkToken(body.link_token);
  if (!uid) return jsonError("That took too long. Sign in again.", 401);
  const email = normalizeEmail(body.email);
  if (!email) return jsonError("That email doesn't look right.", 400);
  const code = typeof body.code === "string" || typeof body.code === "number" ? String(body.code) : "";
  if (!code.trim()) return jsonError("Type in the code from your email.", 400);
  try {
    const { db } = getFirebaseAdmin();
    const r = await verifyCode(firestoreCodeStore(db), { email, code, secret: process.env.MOBILE_JWT_SECRET!.trim() });
    if (r.result !== "ok") {
      const e = checkError(r.result, r.attemptsLeft);
      return jsonError(e.error, e.status);
    }
    return Response.json(await completeLink({ links: firestoreLinkStore(db), identity: firestoreIdentity(db) }, uid, email));
  } catch (e) {
    return serverError(e, "auth/link/verify");
  }
}
