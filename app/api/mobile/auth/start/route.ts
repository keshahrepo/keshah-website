// KESHAH Creators app: email a 6-digit sign-in code.
// POST { email } -> { ok: true }
// Always ok for any well-formed email (never says whether we know it).
// 429 when rate limited, 503 when sign-in or email isn't set up.

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { emailConfigured, sendEmail } from "@/lib/email";
import { demoLogin } from "@/lib/mobile/demo";
import { codeEmail, issueCode, ISSUE_ERRORS } from "@/lib/mobile/codes";
import { firestoreCodeStore } from "@/lib/mobile/firestore";
import { clientIp, jsonError, mobileOff, readJson, serverError } from "@/lib/mobile/http";
import { mobileAuthConfigured, normalizeEmail } from "@/lib/mobile/token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mobileAuthConfigured()) return mobileOff();
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  if (!email) return jsonError("That email doesn't look right.", 400);
  // The App Review demo account signs in with its fixed code; no email is sent.
  {
    const demo = await demoLogin(getFirebaseAdmin().db).catch(() => null);
    if (demo && email === demo.email) return Response.json({ ok: true });
  }
  if (!emailConfigured()) return jsonError("We can't send codes right now. Try again later.", 503);
  try {
    const { db } = getFirebaseAdmin();
    const r = await issueCode(firestoreCodeStore(db), {
      email,
      ip: clientIp(req),
      secret: process.env.MOBILE_JWT_SECRET!.trim(),
    });
    if (!r.ok) return jsonError(ISSUE_ERRORS[r.reason], 429);
    await sendEmail({ to: email, fromName: "KESHAH Creators", ...codeEmail(r.code) });
    return Response.json({ ok: true });
  } catch (e) {
    return serverError(e, "auth/start");
  }
}
