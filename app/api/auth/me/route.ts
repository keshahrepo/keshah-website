import { NextRequest, NextResponse } from "next/server";
import { getRoleFromToken, COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  const role = await getRoleFromToken(token);
  if (!role) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  return NextResponse.json({ role });
}
