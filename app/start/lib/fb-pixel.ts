"use client";

// Facebook Pixel + Conversions API client helpers.
//
// Usage:
//   import { fbqTrack, fbqTrackOnce, trackPurchaseWithCAPI } from "./fb-pixel";
//   fbqTrackOnce("Lead");
//   await trackPurchaseWithCAPI({ value: 57, currency: "USD", email });
//
// All functions are no-ops when NEXT_PUBLIC_FB_PIXEL_ID is missing — safe to
// call from anywhere without env-checking. Browser-only; SSR-safe.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FbqFn = (...args: any[]) => void;

declare global {
  interface Window {
    fbq?: FbqFn & { callMethod?: FbqFn; queue?: unknown[] };
    _fbq?: FbqFn;
  }
}

export type FbStandardEvent =
  | "PageView"
  | "ViewContent"
  | "Lead"
  | "InitiateCheckout"
  | "AddPaymentInfo"
  | "Purchase"
  | "CompleteRegistration"
  | "StartTrial";

interface EventParams {
  value?: number;
  currency?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

/** Returns true if Pixel is configured. */
function isPixelEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(process.env.NEXT_PUBLIC_FB_PIXEL_ID);
}

/** Generate a UUID v4 — used as event_id for dedup between browser and CAPI. */
export function newEventId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for old browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** Fire a Pixel event in the browser. */
export function fbqTrack(event: FbStandardEvent, params?: EventParams, eventId?: string): void {
  if (!isPixelEnabled()) return;
  if (typeof window.fbq !== "function") return;
  try {
    if (eventId) {
      window.fbq("track", event, params ?? {}, { eventID: eventId });
    } else {
      window.fbq("track", event, params ?? {});
    }
  } catch {
    // Pixel script failed to load — fail silently.
  }
}

/** Fire a Pixel event only once per browser session (sessionStorage-backed). */
export function fbqTrackOnce(event: FbStandardEvent, params?: EventParams): void {
  if (typeof window === "undefined") return;
  const key = `fbq_once_${event}`;
  try {
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorage may be blocked — fall through and just fire it
  }
  fbqTrack(event, params);
}

/** Read a Meta pixel cookie (_fbp / _fbc) for CAPI matching.
 *
 * Returns the raw cookie value. We do NOT decodeURIComponent — Meta's pixel
 * stores `_fbp` and `_fbc` as plain strings (e.g. `fb.1.1234567890.abc`),
 * not URL-encoded. Decoding would mutate any value that happens to contain
 * a `%xx` sequence and trip Meta's "Server sending modified fbclid value"
 * Conversions API health check. Pass through verbatim. */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? match[1] : null;
}

interface PurchaseInput {
  value: number;
  currency: string;
  email?: string;
}

interface InitiateCheckoutInput {
  value: number;
  currency: string;
  contentName?: string;
  contentId?: string;
  email?: string;
}

/** Fire an InitiateCheckout event via BOTH browser Pixel and server-side CAPI.
 *  Both share the same eventId so Meta dedupes. Without the CAPI backup, IC
 *  fires client-only and iOS ITP / ad blockers / privacy extensions blackhole
 *  a large chunk — the ad optimizer then thinks it's not getting signal. */
export async function trackInitiateCheckoutWithCAPI(
  input: InitiateCheckoutInput
): Promise<void> {
  const eventId = newEventId();

  // Browser pixel (blockable, that's fine — CAPI backs it up).
  fbqTrack(
    "InitiateCheckout",
    {
      value: input.value,
      currency: input.currency,
      ...(input.contentName ? { content_name: input.contentName } : {}),
      ...(input.contentId ? { content_ids: [input.contentId] } : {}),
    },
    eventId
  );

  try {
    await fetch("/api/fb/track-initiate-checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        value: input.value,
        currency: input.currency,
        contentName: input.contentName,
        contentId: input.contentId,
        email: input.email,
        eventSourceUrl:
          typeof window !== "undefined" ? window.location.href : undefined,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
      keepalive: true,
    });
  } catch {
    // CAPI failed — browser pixel still fired.
  }
}

/** Fire a Purchase event via BOTH browser Pixel and server-side CAPI.
 *  Both events share the same event_id so Facebook dedupes them.
 *  CAPI is the source of truth — browser Pixel is a backup. */
export async function trackPurchaseWithCAPI(input: PurchaseInput): Promise<void> {
  const eventId = newEventId();

  // 1. Fire browser Pixel (may be blocked by ad blockers — that's fine)
  fbqTrack("Purchase", { value: input.value, currency: input.currency }, eventId);

  // 2. Fire server-side CAPI (cannot be blocked, source of truth)
  try {
    await fetch("/api/fb/track-purchase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventId,
        value: input.value,
        currency: input.currency,
        email: input.email,
        eventSourceUrl: typeof window !== "undefined" ? window.location.href : undefined,
        fbp: readCookie("_fbp"),
        fbc: readCookie("_fbc"),
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      }),
      // Don't block the user on this — fire and forget
      keepalive: true,
    });
  } catch {
    // CAPI call failed — browser Pixel still fired, so we're not totally blind
  }
}
