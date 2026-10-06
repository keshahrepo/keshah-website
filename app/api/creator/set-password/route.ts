import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, createToken } from "@/lib/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { hashPassword } from "@/lib/password";
import { CREATORS_COLLECTION } from "@/lib/creators/db";
import { hashInviteToken, inviteProblem, passwordProblem } from "@/lib/creators/invite";

export const dynamic = "force-dynamic";

// Public (no session): the set-password token IS the credential. Tokens are
// 32 random bytes and only their SHA-256 is stored, so guessing isn't viable.

function inviteQuery(token: string) {
  return getFirebaseAdmin()
    .db.collection(CREATORS_COLLECTION)
    .where("invite.token_hash", "==", hashInviteToken(token))
    .limit(1);
}

function tokenOf(v: unknown): string | null {
  return typeof v === "string" && /^[A-Za-z0-9_-]{20,100}$/.test(v) ? v : null;
}

// GET /api/creator/set-password?token=... -> { first_name } if the link is usable.
export async function GET(req: NextRequest) {
  const token = tokenOf(req.nextUrl.searchParams.get("token"));
  if (!token) return NextResponse.json({ error: "This link isn't valid. Ask Aadi for a new one." }, { status: 400 });
  const snap = await inviteQuery(token).get();
  const d = snap.docs[0]?.data();
  const problem = inviteProblem(d?.invite);
  if (problem || !d) return NextResponse.json({ error: problem }, { status: 400 });
  return NextResponse.json({ first_name: String(d.name || d.legal_name || "").trim().split(/\s+/)[0] || "" });
}

// POST /api/creator/set-password { token, password } -> sets the password, marks the
// link used and signs them in (same session cookie as /api/auth/login).
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: unknown; password?: unknown };
  const token = tokenOf(body.token);
  if (!token) return NextResponse.json({ error: "This link isn't valid. Ask Aadi for a new one." }, { status: 400 });
  const pwProblem = passwordProblem(body.password);
  if (pwProblem) return NextResponse.json({ error: pwProblem }, { status: 400 });
  const password = body.password as string;

  const { db } = getFirebaseAdmin();
  let result: { id: string; name: string } | { error: string };
  try {
    result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(inviteQuery(token));
      const doc = snap.docs[0];
      const d = doc?.data();
      const problem = inviteProblem(d?.invite);
      if (problem || !doc || !d) return { error: problem ?? "This link isn't valid." };
      if (d.is_active === false || !d.email) return { error: "This account isn't active. Message Aadi and he'll sort it out." };
      // Same scheme /api/auth/login verifies: sha256(password + salt), hex.
      const { hash, salt } = hashPassword(password);
      tx.update(doc.ref, {
        password_hash: hash,
        password_salt: salt,
        password_set_at: new Date().toISOString(),
        "invite.used_at": new Date().toISOString(),
      });
      return { id: doc.id, name: String(d.name || d.legal_name || "") };
    });
  } catch (e) {
    console.error("set-password error:", e);
    return NextResponse.json({ error: "Something went wrong. Try again in a minute." }, { status: 500 });
  }
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });

  const session = await createToken({ role: "creator", userId: result.id, name: result.name });
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, session, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
