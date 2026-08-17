// TikTok Events API — server-side InitiateCheckout tracking.
//
// Mirrors /api/tiktok/track-purchase. Fires alongside the browser pixel from
// Us3PlanModal / PlanModal handleContinue, sharing the same eventId so
// TikTok dedupes browser-pixel + Events-API copies of the same event.
//
// Purpose: data fidelity. Browser pixels are blocked by ad-blockers / iOS
// Private Relay / tracking-prevention features in ~20-30% of sessions, so
// without a server-side companion the dashboard under-counts real trial
// starts. We are NOT optimizing campaigns on InitiateCheckout — Purchase
// remains the optimization event — but accurate IC counts let us see the
// real paywall → checkout-click drop-off in our own dashboards.
//
// Required env vars (same as track-purchase):
//   NEXT_PUBLIC_TIKTOK_PIXEL_ID  — the pixel ID
//   TIKTOK_ACCESS_TOKEN          — Events API access token (server-only)
//   TIKTOK_TEST_EVENT_CODE       — optional, for "Test Events" verification

import { NextResponse } from "next/server";
import crypto from "crypto";

interface CheckoutPayload {
  eventId: string;
  value: number;
  currency: string;
  email?: string;
  externalId?: string;
  eventSourceUrl?: string;
  ttp?: string | null;     // _ttp cookie — TikTok's browser ID
  ttclid?: string | null;  // ttclid query param or persisted cookie
  userAgent?: string;
  contents?: Array<{ content_id?: string; content_type?: string; content_name?: string }>;
}

function hash(s: string): string {
  return crypto.createHash("sha256").update(s.trim().toLowerCase()).digest("hex");
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
  const pixelId = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "D7QJ3C3C77U44OJIQ44G";
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const testEventCode = process.env.TIKTOK_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    return NextResponse.json({ ok: true, skipped: "not_configured" });
  }

  let payload: CheckoutPayload;
  try {
    payload = (await req.json()) as CheckoutPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!payload.eventId || typeof payload.value !== "number" || !payload.currency) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const user: Record<string, any> = {};
  if (payload.email) user.email = hash(payload.email);
  if (payload.externalId) user.external_id = hash(payload.externalId);
  const ip = getClientIp(req);
  if (ip) user.ip = ip;
  if (payload.userAgent) user.user_agent = payload.userAgent;
  if (payload.ttp) user.ttp = payload.ttp;
  if (payload.ttclid) user.ttclid = payload.ttclid;

  const event = {
    event: "InitiateCheckout",
    event_time: Math.floor(Date.now() / 1000),
    event_id: payload.eventId,
    user,
    properties: {
      currency: payload.currency,
      value: payload.value,
      ...(payload.contents ? { contents: payload.contents } : {}),
    },
    page: payload.eventSourceUrl
      ? { url: payload.eventSourceUrl }
      : undefined,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body: Record<string, any> = {
    event_source: "web",
    event_source_id: pixelId,
    data: [event],
  };
  if (testEventCode) {
    body.test_event_code = testEventCode;
  }

  const url = "https://business-api.tiktok.com/open_api/v1.3/event/track/";

  try {
    const ttRes = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Access-Token": accessToken,
      },
      body: JSON.stringify(body),
    });
    const json = await ttRes.json();
    if (!ttRes.ok || (typeof json.code === "number" && json.code !== 0)) {
      // eslint-disable-next-line no-console
      console.error("[tt-eapi/checkout] TikTok returned error", json);
      return NextResponse.json({ ok: false, tt: json }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tt: json });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[tt-eapi/checkout] fetch failed", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}
