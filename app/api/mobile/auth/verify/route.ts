// KESHAH Creators app: check the emailed code and sign in.
// POST { email, code } -> { token, role, name, email, creator_id?, application_id? }

import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { checkError, verifyCode } from "@/lib/mobile/codes";
import { demoLogin } from "@/lib/mobile/demo";
import { firestoreCodeStore, resolveIdentity } from "@/lib/mobile/firestore";
import { jsonError, mobileOff, readJson, serverError } from "@/lib/mobile/http";
import { claimsFor } from "@/lib/mobile/identity";
import { mobileAuthConfigured, normalizeEmail, signMobileToken } from "@/lib/mobile/token";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (!mobileAuthConfigured()) return mobileOff();
  const body = await readJson(req);
  const email = normalizeEmail(body.email);
  if (!email) return jsonError("That email doesn't look right.", 400);
  const code = typeof body.code === "string" || typeof body.code === "number" ? String(body.code) : "";
  if (!code.trim()) return jsonError("Type in the code from your email.", 400);
  try {
    const { db } = getFirebaseAdmin();
    // App Review's demo account: a fixed code, no email.
    const demo = await demoLogin(db);
    if (demo && email === demo.email && code.replace(/\D/g, "") === demo.code) {
      const id = await resolveIdentity(db, email);
      return Response.json({ token: await signMobileToken(claimsFor(id)), ...id });
    }
    const r = await verifyCode(firestoreCodeStore(db), { email, code, secret: process.env.MOBILE_JWT_SECRET!.trim() });
    if (r.result !== "ok") {
      const e = checkError(r.result, r.attemptsLeft);
      return jsonError(e.error, e.status);
    }
    const id = await resolveIdentity(db, email);
    const token = await signMobileToken(claimsFor(id));
    return Response.json({ token, ...id });
  } catch (e) {
    return serverError(e, "auth/verify");
  }
}
