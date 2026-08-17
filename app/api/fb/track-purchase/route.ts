// Facebook Conversions API — server-side Purchase tracking.
//
// This is the source-of-truth Purchase event. Fired from PlanModal's
// handlePurchaseSuccess via trackPurchaseWithCAPI(), in addition to the
// browser Pixel call. Both events share the same eventId so Facebook
// dedupes them.
//
// Required env vars (set in Vercel):
//   NEXT_PUBLIC_FB_PIXEL_ID    — the 15-16 digit Pixel ID
//   FB_CAPI_ACCESS_TOKEN       — Conversions API access token (from
//                                Events Manager → Conversions API → Generate)
//   FB_CAPI_TEST_EVENT_CODE    — optional, for testing in Events Manager →
//                                Test Events tab. Remove before launch.

import { NextResponse } from "next/server";
import crypto from "crypto";

interface PurchasePayload {
  eventId: string;
  value: number;
  currency: string;
  email?: string;
  eventSourceUrl?: string;
  fbp?: string | null;
  fbc?: string | null;
  userAgent?: string;
}

/** Hash an email for Facebook (SHA-256 of lowercase, trimmed email). */
function hashEmail(email: string): string {
  return crypto
    .createHash("sha256")
    .update(email.trim().toLowerCase())
    .digest("hex");
}

/** Get the client IP from the request, falling back through common proxy headers. */
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
    // Pixel not configured — silently no-op so dev/preview envs don't error.
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  let payload: PurchasePayload;
  try {
    payload = (await req.json()) as PurchasePayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!payload.eventId || typeof payload.value !== "number" || !payload.currency) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // Build the user_data block. Facebook uses these for identity matching;
  // more fields = better match quality = better attribution.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const userData: Record<string, any> = {};
  if (payload.email) userData.em = [hashEmail(payload.email)];
  if (payload.fbp) userData.fbp = payload.fbp;
  if (payload.fbc) userData.fbc = payload.fbc;
  const ip = getClientIp(req);
  if (ip) userData.client_ip_address = ip;
  if (payload.userAgent) userData.client_user_agent = payload.userAgent;

  const event = {
    event_name: "Purchase",
    event_time: Math.floor(Date.now() / 1000),
    event_id: payload.eventId, // for dedup with browser Pixel
    event_source_url: payload.eventSourceUrl,
    action_source: "website",
    user_data: userData,
    custom_data: {
      value: payload.value,
      currency: payload.currency,
    },
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
      console.error("[fb-capi] Facebook returned non-OK", json);
      return NextResponse.json({ ok: false, fb: json }, { status: 502 });
    }
    return NextResponse.json({ ok: true, fb: json });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[fb-capi] fetch failed", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}
