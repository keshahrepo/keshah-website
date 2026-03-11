import { NextRequest, NextResponse } from "next/server";
import { getPayloadFromToken, COOKIE_NAME } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  const payload = await getPayloadFromToken(token);
  if (!payload) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  return NextResponse.json({
    role: payload.role,
    userId: payload.userId || null,
    name: payload.name || null,
  });
}
