/** Shared request helpers for /api/mobile/* routes. */
import { NextResponse } from "next/server";
import { bearerToken, mobileAuthConfigured, MOBILE_OFF_MESSAGE, verifyMobileToken, type MobileClaims } from "./token";

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

export function mobileOff(): NextResponse {
  return jsonError(MOBILE_OFF_MESSAGE, 503);
}

/** Verified claims from the Bearer token, or the error response to return. */
export async function requireMobile(req: Request): Promise<MobileClaims | NextResponse> {
  if (!mobileAuthConfigured()) return mobileOff();
  const token = bearerToken(req.headers);
  if (!token) return jsonError("Sign in first.", 401);
  const claims = await verifyMobileToken(token);
  if (!claims) return jsonError("Your sign-in has expired. Sign in again.", 401);
  return claims;
}

export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  const b = await req.json().catch(() => null);
  return b && typeof b === "object" && !Array.isArray(b) ? (b as Record<string, unknown>) : {};
}

export function serverError(e: unknown, where: string): NextResponse {
  console.error(`mobile ${where} error:`, e);
  return jsonError("Something went wrong. Try again in a minute.", 500);
}
