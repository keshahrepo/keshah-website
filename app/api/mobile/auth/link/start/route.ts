// KESHAH Creators app: email a code to prove the application email for a
// Google / Apple sign-in that needs linking. Same code store and limits as
// /api/mobile/auth/start.
// POST { link_token, email } -> { ok: true }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { codeEmail, issueCode, ISSUE_ERRORS } from "@/lib/mobile/codes";
import { firestoreCodeStore } from "@/lib/mobile/firestore";
import { clientIp, jsonError, mobileOff, readJson, serverError } from "@/lib/mobile/http";
import { mobileAuthConfigured, normalizeEmail, verifyLinkToken } from "@/lib/mobile/token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mobileAuthConfigured()) return mobileOff();
  const body = await readJson(req);
  if (!(await verifyLinkToken(body.link_token))) return jsonError("That took too long. Sign in again.", 401);
  const email = normalizeEmail(body.email);
  if (!email) return jsonError("That email doesn't look right.", 400);
  if (!emailConfigured()) return jsonError("We can't send codes right now. Try again later.", 503);
  try {
    const { db } = getFirebaseAdmin();
    const r = await issueCode(firestoreCodeStore(db), { email, ip: clientIp(req), secret: process.env.MOBILE_JWT_SECRET!.trim() });
    if (!r.ok) return jsonError(ISSUE_ERRORS[r.reason], 429);
    await sendEmail({ to: email, fromName: "KESHAH Creators", ...codeEmail(r.code) });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "auth/link/start");
  }
}
