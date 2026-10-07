import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, getPayloadFromToken } from "@/lib/auth";
import { CreatorDataError, assertOnboarded, getCreator } from "@/lib/creators/db";
import type { CreatorProfile } from "@/lib/creators/types";
import { bearerToken, mobileAuthConfigured, MOBILE_OFF_MESSAGE, verifyMobileToken } from "@/lib/mobile/token";
import { creatorIdForClaims } from "@/lib/mobile/identity";

export interface CreatorAuthDeps {
  /** Looks up an active creator by login email (mobile tokens without a cid claim). */
  findCreatorByEmail?: (email: string) => Promise<{ id: string; name: string } | null>;
}

async function defaultFindCreatorByEmail(email: string) {
  const [{ getFirebaseAdmin }, { findCreatorByEmail }] = await Promise.all([
    import("@/lib/firebase-admin"),
    import("@/lib/mobile/firestore"),
  ]);
  return findCreatorByEmail(getFirebaseAdmin().db, email);
}

/**
 * The signed-in creator's id, from EITHER the portal session cookie OR an
 * "Authorization: Bearer <token>" from the KESHAH Creators app. A bearer
 * header, when present, is the only credential looked at. The id ALWAYS
 * comes from a signed token (or the email inside one), never from the request
 * body, so a creator can only ever reach their own ContentCreators doc.
 */
export async function creatorIdFromRequest(
  req: NextRequest,
  deps: CreatorAuthDeps = {},
): Promise<{ id: string } | NextResponse> {
  const bearer = bearerToken(req.headers);
  if (bearer) {
    if (!mobileAuthConfigured()) return NextResponse.json({ error: MOBILE_OFF_MESSAGE }, { status: 503 });
    const claims = await verifyMobileToken(bearer);
    if (!claims) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const id = await creatorIdForClaims(claims, deps.findCreatorByEmail ?? defaultFindCreatorByEmail);
    if (!id) return NextResponse.json({ error: "Creator access only" }, { status: 403 });
    return { id };
  }
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = await getPayloadFromToken(token);
  if (!payload || payload.role !== "creator" || !payload.userId) {
    return NextResponse.json({ error: "Creator access only" }, { status: 403 });
  }
  return { id: payload.userId };
}

/** Resolve the signed-in creator (cookie or mobile bearer token, see creatorIdFromRequest). */
export async function requireCreator(req: NextRequest, deps: CreatorAuthDeps = {}): Promise<CreatorProfile | NextResponse> {
  const who = await creatorIdFromRequest(req, deps);
  if (who instanceof NextResponse) return who;
  const creator = await getCreator(who.id);
  if (!creator || !creator.is_active) return NextResponse.json({ error: "Creator not found" }, { status: 404 });
  return creator;
}

/** Rejects (friendly 403) until Getting started is finished. Returns null when allowed. */
export async function requireOnboarded(creator: CreatorProfile): Promise<NextResponse | null> {
  try {
    await assertOnboarded(creator);
    return null;
  } catch (e) {
    return errorResponse(e, "onboarding gate");
  }
}

/** Client IP (first x-forwarded-for hop on Vercel) and user agent, for audit records. */
export function requestMeta(req: NextRequest): { ip: string; user_agent: string } {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  const ip = xff.split(",")[0].trim() || req.headers.get("x-real-ip") || "unknown";
  return { ip, user_agent: req.headers.get("user-agent") ?? "unknown" };
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
    // Work before pay started in the system (Isai: September): the app's months and Videos start here.
    history_start_date: c.bonus_start_date && c.bonus_start_date < (c.start_date || "9999") ? c.bonus_start_date : c.start_date,
    tracking_url: c.tracking_url,
    format_creator: c.format_creator,
  };
}
