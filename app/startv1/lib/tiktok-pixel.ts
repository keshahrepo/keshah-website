"use client";

// TikTok Pixel client helpers — mirrors fb-pixel.ts shape.
//
// Usage:
//   import { ttqTrack, ttqTrackOnce, ttqIdentify } from "./tiktok-pixel";
//   ttqTrackOnce("ViewContent");
//   ttqTrack("InitiateCheckout", { value: 57, currency: "USD" });
//   await ttqIdentify({ email });
//
// All functions are browser-only no-ops when the pixel hasn't loaded — safe
// to call anywhere. The pixel itself is loaded in app/layout.tsx.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type TtqFn = (...args: any[]) => void;

declare global {
  interface Window {
    ttq?: TtqFn & {
      track?: TtqFn;
      identify?: TtqFn;
      page?: TtqFn;
    };
  }
}

// TikTok standard event names. We use a subset relevant to a subscription
// funnel; full list at https://business-api.tiktok.com/portal/docs?id=1739585702922241
export type TtqStandardEvent =
  | "ViewContent"
  | "ClickButton"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "PlaceAnOrder"
  | "CompletePayment"
  | "CompleteRegistration"
  | "Subscribe"
  | "Purchase";

interface EventContent {
  content_id?: string;
  content_type?: "product" | "product_group";
  content_name?: string;
}

interface EventParams {
  value?: number;
  currency?: string;
  contents?: EventContent[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function isPixelEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // Conversion events fire only on /startus2 — the flow our TikTok ads
  // currently target. Other flows (India, /start, /startfree, /chad) keep
  // the pixel loaded for PageView signal but skip conversion firing so the
  // TikTok algorithm gets clean, single-source optimization data.
  if (
    !window.location.pathname.startsWith("/startus2") &&
    !window.location.pathname.startsWith("/startus3") &&
    !window.location.pathname.startsWith("/mandy") &&
    !window.location.pathname.startsWith("/f/")
  ) {
    return false;
  }
  // Pixel ID is set in app/layout.tsx; just check the global instead of env
  // so the helper still works if someone changes the layout pixel id.
  return typeof window.ttq?.track === "function";
}

/** Fire a TikTok pixel event. */
export function ttqTrack(event: TtqStandardEvent, params?: EventParams): void {
  if (!isPixelEnabled()) return;
  try {
    window.ttq!.track!(event, params ?? {});
  } catch {
    // Pixel script blocked or load-failed — silent no-op.
  }
}

/** Fire a TikTok pixel event only once per browser session. */
export function ttqTrackOnce(event: TtqStandardEvent, params?: EventParams): void {
  if (typeof window === "undefined") return;
  const key = `ttq_once_${event}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage may be blocked — fall through and fire anyway.
  }
  ttqTrack(event, params);
}

/** Generate a UUID v4 — used as event_id for dedup between browser pixel
 *  and server-side Events API. */
function newEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Read a cookie by name. Returns null if not set or running server-side. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

interface PurchaseInput {
  value: number;
  currency: string;
  email?: string;
  externalId?: string;
  contents?: EventContent[];
}

/** Fire an InitiateCheckout via BOTH the browser pixel and the server-side
 *  Events API with a shared event_id so TikTok dedupes them. Same pattern as
 *  trackPurchaseTikTok — server-side fire is the source of truth (survives
 *  ad-blockers / iOS Private Relay); browser pixel is the backup.
 *
 *  Note: we are NOT optimizing TikTok campaigns on InitiateCheckout —
 *  Purchase remains the optimization event. This dual-fire is purely for
 *  accurate paywall → checkout-click counts in our own analytics. */
export async function trackCheckoutTikTok(input: PurchaseInput): Promise<void> {
  if (typeof window === "undefined") return;
  if (
    !window.location.pathname.startsWith("/startus2") &&
    !window.location.pathname.startsWith("/startus3") &&
    !window.location.pathname.startsWith("/mandy") &&
    !window.location.pathname.startsWith("/f/")
  ) {
    return;
  }

  const eventId = newEventId();

  if (typeof window.ttq?.track === "function") {
    try {
      window.ttq.track("InitiateCheckout", {
        event_id: eventId,
        value: input.value,
        currency: input.currency,
        ...(input.contents ? { contents: input.contents } : {}),
      });
    } catch {
      // silent
    }
  }

  const url = new URL(window.location.href);
  const ttclid = url.searchParams.get("ttclid") || readCookie("ttclid");

  try {
    await fetch("/api/tiktok/track-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        value: input.value,
        currency: input.currency,
        email: input.email,
        externalId: input.externalId,
        contents: input.contents,
        eventSourceUrl: window.location.href,
        ttp: readCookie("_ttp"),
        ttclid,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
      keepalive: true,
    });
  } catch {
    // silent — browser pixel still fired
  }
}

/** Fire a Purchase via BOTH the browser pixel and the server-side Events API
 *  with a shared event_id so TikTok dedupes them. Server-side is the source
 *  of truth (cannot be blocked by ad-blockers/iCloud Private Relay); browser
 *  pixel is the backup. */
export async function trackPurchaseTikTok(input: PurchaseInput): Promise<void> {
  // Path-gate so non-/startus2 traffic doesn't pollute the optimization signal.
  if (typeof window === "undefined") return;
  if (
    !window.location.pathname.startsWith("/startus2") &&
    !window.location.pathname.startsWith("/startus3") &&
    !window.location.pathname.startsWith("/mandy") &&
    !window.location.pathname.startsWith("/f/")
  ) {
    return;
  }

  const eventId = newEventId();

  // 1) Browser pixel — fire with the shared event_id.
  if (typeof window.ttq?.track === "function") {
    try {
      window.ttq.track("Purchase", {
        event_id: eventId,
        value: input.value,
        currency: input.currency,
        ...(input.contents ? { contents: input.contents } : {}),
      });
    } catch {
      // silent
    }
  }

  // 2) Server-side Events API — POST to our backend, which forwards to
  //    TikTok's event/track/ endpoint with the access token.
  // ttclid arrives as a URL parameter when the user clicks a TT ad — we
  // pull it from the current URL or a cookie if you set one server-side.
  const url = new URL(window.location.href);
  const ttclid = url.searchParams.get("ttclid") || readCookie("ttclid");

  try {
    await fetch("/api/tiktok/track-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        value: input.value,
        currency: input.currency,
        email: input.email,
        externalId: input.externalId,
        contents: input.contents,
        eventSourceUrl: window.location.href,
        ttp: readCookie("_ttp"),
        ttclid,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
      keepalive: true,
    });
  } catch {
    // Server-side fire failed — browser pixel still fired (best effort).
  }
}

/** SHA-256 hash via Web Crypto. Returns lowercase hex. */
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input.trim().toLowerCase());
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface IdentifyInput {
  email?: string;
  phone?: string;
  externalId?: string;
}

/** Send hashed PII to the pixel via ttq.identify. Augments the Automatic
 *  Advanced Matching that already runs on form fields — useful when the
 *  email comes from social-signin (Google/Apple) and was never typed into
 *  a visible form input. */
export async function ttqIdentify(input: IdentifyInput): Promise<void> {
  if (!isPixelEnabled()) return;
  if (typeof window.ttq?.identify !== "function") return;

  const payload: Record<string, string> = {};
  if (input.email) payload.email = await sha256Hex(input.email);
  if (input.phone) payload.phone_number = await sha256Hex(input.phone);
  if (input.externalId) payload.external_id = await sha256Hex(input.externalId);

  if (Object.keys(payload).length === 0) return;
  try {
    window.ttq.identify(payload);
  } catch {
    // silent
  }
}
