// Facebook Conversions API — server-side InitiateCheckout tracking.
//
// Mirror of /api/fb/track-purchase but for InitiateCheckout. Without this,
// IC only fires from the browser Pixel, which iOS ITP + ad blockers + privacy
// extensions block routinely — so Meta's ad optimization on this event
// starves. CAPI is server-to-server so it can't be blocked.
//
// Same eventId dedup contract: browser + CAPI both send with the same id →
// Meta dedupes into one event with the highest-quality field union.

import { NextResponse } from "next/server";
import crypto from "crypto";

interface IcPayload {
  eventId: string;
  value: number;
  currency: string;
  contentName?: string;
  contentId?: string;
  email?: string;
  eventSourceUrl?: string;
  fbp?: string | null;
  fbc?: string | null;
  userAgent?: string;
}

function hashEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

function getClientIp(req: Request): string | undefined {
  const headers = req.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp;
  return undefined;
}

export async function POST(req: Request) {
  const pixelId = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
  const accessToken = process.env.FB_CAPI_ACCESS_TOKEN;
  const testEventCode = process.env.FB_CAPI_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  let payload: IcPayload;
  try {
    payload = (await req.json()) as IcPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!payload.eventId || typeof payload.value !== "number" || !payload.currency) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userData: Record<string, any> = {};
  if (payload.email) userData.em = [hashEmail(payload.email)];
  if (payload.fbp) userData.fbp = payload.fbp;
  if (payload.fbc) userData.fbc = payload.fbc;
  const ip = getClientIp(req);
  if (ip) userData.client_ip_address = ip;
  if (payload.userAgent) userData.client_user_agent = payload.userAgent;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const customData: Record<string, any> = {
    value: payload.value,
    currency: payload.currency,
  };
  if (payload.contentName) customData.content_name = payload.contentName;
  if (payload.contentId) customData.content_ids = [payload.contentId];

  const event = {
    event_name: "InitiateCheckout",
    event_time: Math.floor(Date.now() / 1000),
    event_id: payload.eventId,
    event_source_url: payload.eventSourceUrl,
    action_source: "website",
    user_data: userData,
    custom_data: customData,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    data: [event],
    access_token: accessToken,
  };
  if (testEventCode) {
    body.test_event_code = testEventCode;
  }

  const url = `https://graph.facebook.com/v18.0/${pixelId}/events`;

  try {
    const fbRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await fbRes.json();
    if (!fbRes.ok) {
      // eslint-disable-next-line no-console
      console.error("[fb-capi ic] Facebook returned non-OK", json);
      return NextResponse.json({ ok: false, fb: json }, { status: 502 });
    }
    return NextResponse.json({ ok: true, fb: json });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fb-capi ic] fetch failed", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}
