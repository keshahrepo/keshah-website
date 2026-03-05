import { NextRequest, NextResponse } from "next/server";
import { createToken, COOKIE_NAME, type Role } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();

  let role: Role | null = null;
  if (password === process.env.DASHBOARD_PASSWORD) {
    role = "admin";
  } else if (password === process.env.MARKETING_PASSWORD) {
    role = "marketing";
  }

  if (!role) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const token = await createToken(role);

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
