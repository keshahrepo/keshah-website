import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, getPayloadFromToken } from "@/lib/auth";
import { CreatorDataError, getCreator } from "@/lib/creators/db";
import type { CreatorProfile } from "@/lib/creators/types";

/**
 * Resolve the signed-in creator from the session cookie. The creator id
 * ALWAYS comes from the token, never from the request, so a creator can only
 * ever read or write their own ContentCreators doc.
 */
export async function requireCreator(req: NextRequest): Promise<CreatorProfile | NextResponse> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await getPayloadFromToken(token);
  if (!payload || payload.role !== "creator" || !payload.userId) {
    return NextResponse.json({ error: "Creator access only" }, { status: 403 });
  }
  const creator = await getCreator(payload.userId);
  if (!creator || !creator.is_active) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return creator;
}

export function errorResponse(e: unknown, where: string): NextResponse {
  if (e instanceof CreatorDataError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error(`creator ${where} error:`, e);
  return NextResponse.json({ error: "Something went wrong. Try again in a minute." }, { status: 500 });
}

/** Profile fields safe to show the creator (no status flag, no revenue). */
export function publicCreator(c: CreatorProfile) {
  return {
    name: c.name,
    legal_name: c.legal_name,
    email: c.email,
    keshah_email: c.keshah_email,
    tiktok_handle: c.tiktok_handle,
    instagram_handle: c.instagram_handle,
    timezone: c.timezone,
    start_date: c.start_date,
  };
}
