import { NextRequest, NextResponse } from "next/server";
import { createToken, COOKIE_NAME, type Role } from "@/lib/auth";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { verifyPassword } from "@/lib/password";

export async function POST(req: NextRequest) {
  const { email, password, login_type } = await req.json();

  let role: Role | null = null;
  let userId: string | undefined;
  let name: string | undefined;

  // Creator login
  if (login_type === "creator" && email) {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("ContentCreators")
      .where("email", "==", email.toLowerCase().trim())
      .where("is_active", "==", true)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();
      if (data.password_hash && verifyPassword(password, data.password_hash, data.password_salt)) {
        role = "creator";
        userId = doc.id;
        name = data.name;
      }
    }
  }
  // Manager login (email provided)
  else if (email) {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("Managers")
      .where("email", "==", email.toLowerCase().trim())
      .where("is_active", "==", true)
      .limit(1)
      .get();

    if (!snap.empty) {
      const doc = snap.docs[0];
      const data = doc.data();
      if (verifyPassword(password, data.password_hash, data.password_salt)) {
        role = "manager";
        userId = doc.id;
        name = data.name;
      }
    }
  } else {
    // Legacy password-only login for admin/marketing
    if (password === process.env.DASHBOARD_PASSWORD) {
      role = "admin";
    } else if (password === process.env.MARKETING_PASSWORD) {
      role = "marketing";
    }
  }

  if (!role) {
    return NextResponse.json({ error: "Wrong credentials" }, { status: 401 });
  }

  const token = await createToken({ role, userId, name });

  const res = NextResponse.json({ ok: true, role });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });

  return res;
}
