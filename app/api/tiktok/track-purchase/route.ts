// TikTok Events API — server-side Purchase tracking.
//
// Mirrors /api/fb/track-purchase. Fires alongside the browser pixel from
// PlanModal.handlePurchaseSuccess, sharing the same eventId so TikTok dedupes
// browser-pixel + Events-API copies of the same event.
//
// Required env vars (set in Vercel):
//   NEXT_PUBLIC_TIKTOK_PIXEL_ID  — the pixel ID (also exposed to browser)
//   TIKTOK_ACCESS_TOKEN          — generated in Events Manager → Events API
//                                  → "Generate access token". Server-only.
//   TIKTOK_TEST_EVENT_CODE       — optional. Set during testing so events
//                                  show in the "Test Events" tab without
//                                  affecting your live optimization signal.
//                                  Remove (or unset) before going live.

import { NextResponse } from "next/server";
import crypto from "crypto";

interface PurchasePayload {
  eventId: string;
  value: number;
  currency: string;
  email?: string;
  externalId?: string;
  eventSourceUrl?: string;
  ttp?: string | null;     // _ttp cookie — TikTok's browser ID
  ttclid?: string | null;  // ttclid query param when user comes from a TT ad
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
    // Server-side tracking not configured — silent no-op (browser pixel
    // still fires from the client, so we're not totally blind).
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

  // user block — hashed PII for identity matching, plus the cookie/click ID
  // signals TikTok needs to associate the conversion back to the ad click.
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
    event: "Purchase",
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
    // TikTok returns HTTP 200 even for application errors — check the inner
    // `code` field instead. 0 = success.
    if (!ttRes.ok || (typeof json.code === "number" && json.code !== 0)) {
      // eslint-disable-next-line no-console
      console.error("[tt-eapi] TikTok returned error", json);
      return NextResponse.json({ ok: false, tt: json }, { status: 502 });
    }
    return NextResponse.json({ ok: true, tt: json });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[tt-eapi] fetch failed", err);
    return NextResponse.json({ ok: false, error: "fetch_failed" }, { status: 500 });
  }
}
