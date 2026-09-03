"use client";

// RevenueCat Web SDK wrapper.
//
// Lazy-initializes the SDK on first use with an anonymous user ID. Exposes a
// minimal API: getOfferings(), purchasePackage(), and isConfigured().
//
// Gracefully degrades when the API key is missing — callers should check
// isConfigured() and fall back to stub behavior. This lets us ship the
// integration code before the RC dashboard setup is complete.
//
// ──────────────────────────────────────────────────────────────────────────
// REVENUECAT DASHBOARD SETUP CHECKLIST (do these once before going live):
//
// 1. RC dashboard → Account settings → Integrations → Connect Stripe account
// 2. RC dashboard → Apps → New App → "Web Billing"
//    - Name: "KESHAH Web"
//    - Copy the public API key (starts with `rcb_...`) — this is what you
//      set as NEXT_PUBLIC_RC_WEB_BILLING_API_KEY in Vercel
// 3. RC dashboard → Products → Create web products mirroring the funnel:
//    - Monthly plan: $29/month            → RC_PACKAGE_MONTHLY
//    - 3-month plan: $58 every 3 months   → RC_PACKAGE_3MO
//    Pricing mirrors India (₹499/mo, ₹999/3mo) — 33% off on 3-month.
// 4. RC dashboard → Offerings → Create offering with both packages
//    - Make it the "current" offering (or set RC_OFFERING_ID env var to
//      match a specific identifier)
// 5. Apple Pay verification:
//    - In Stripe → Settings → Apple Pay → Add a new domain (keshah.com)
//    - Stripe gives you a verification file
//    - Host it at /.well-known/apple-developer-merchantid-domain-association
//    - The Next.js public/ directory serves this automatically
//
// ──────────────────────────────────────────────────────────────────────────
// VERCEL ENV VARS (set these in Vercel project settings → Environment Variables):
//
//   NEXT_PUBLIC_RC_WEB_BILLING_API_KEY  ← rcb_... (required, public is OK)
//   NEXT_PUBLIC_RC_OFFERING_ID          ← optional, defaults to "current"
//
// ──────────────────────────────────────────────────────────────────────────

import type {
  Offering,
  Package as RCPackage,
  PurchasesError,
  PurchaseResult,
} from "@revenuecat/purchases-js";

// RC Package identifiers — standard $rc_* slugs from the offering.
// (The Stripe product IDs — "1_month", "3_months_plan" — are NOT what
// the JS SDK matches on; it looks up by package.identifier.)
export const RC_PACKAGE_MONTHLY = "$rc_monthly";
export const RC_PACKAGE_3MO = "$rc_three_month";
// /startus3 funnel — 3-month plan with 3-day trial. Same $58 price as
// the standard 3-month, just with a trial intro period configured in RC.
// Package identifier configured in RC dashboard: "3 Months Trial".
export const RC_PACKAGE_3MO_TRIAL = "3 Months Trial";

const STORAGE_KEY = "keshah_rc_anon_user_id";

let initPromise: Promise<unknown> | null = null;
let purchasesInstance: unknown = null;
let configuredUserId: string | null = null;

/** Returns true if the API key is set — callers can branch on this. */
export function isConfigured(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(process.env.NEXT_PUBLIC_RC_WEB_BILLING_API_KEY);
}

/** Lazy initialize the SDK on first call. If a Firebase UID is supplied
 *  (the user has signed up on web), RC is configured with that UID so the
 *  purchase is never anonymous — the mobile app sees the entitlement the
 *  moment it calls Purchases.logIn(uid) after the same-provider sign-in.
 *  If no UID is supplied, falls back to an anonymous RC user persisted in
 *  localStorage (legacy path; safe for pre-paywall browsing). */
async function ensurePurchases(appUserIdOverride?: string): Promise<unknown | null> {
  if (!isConfigured()) return null;

  // If caller asks for a different user than what's configured, reset —
  // the RC JS SDK is configured once per instance with a single App User ID.
  if (
    purchasesInstance &&
    appUserIdOverride &&
    configuredUserId !== appUserIdOverride
  ) {
    purchasesInstance = null;
    initPromise = null;
  }

  if (purchasesInstance) return purchasesInstance;

  if (!initPromise) {
    initPromise = (async () => {
      const mod = await import("@revenuecat/purchases-js");
      const Purchases = mod.Purchases;
      const apiKey = process.env.NEXT_PUBLIC_RC_WEB_BILLING_API_KEY!;

      let appUserId: string;
      if (appUserIdOverride) {
        appUserId = appUserIdOverride;
      } else {
        let anon = window.localStorage.getItem(STORAGE_KEY);
        if (!anon) {
          anon = Purchases.generateRevenueCatAnonymousAppUserId();
          window.localStorage.setItem(STORAGE_KEY, anon);
        }
        appUserId = anon;
      }

      configuredUserId = appUserId;
      purchasesInstance = Purchases.configure({ apiKey, appUserId });
      return purchasesInstance;
    })();
  }

  return initPromise;
}

/** Pre-load the SDK and fetch the offering in the background. Call this
 *  when the paywall mounts so the user doesn't wait on first tap.
 *  Pass the Firebase UID once the user has signed up — RC is reconfigured
 *  with that UID so the purchase ties directly to their real identity. */
export function warmup(firebaseUid?: string): void {
  if (!isConfigured()) return;
  void fetchOffering(firebaseUid);
}

/** Fetch the current offering from RC. Returns null if not configured. */
export async function fetchOffering(firebaseUid?: string): Promise<Offering | null> {
  const purchases = await ensurePurchases(firebaseUid);
  if (!purchases) return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const offerings = await (purchases as any).getOfferings();
  const offeringId = process.env.NEXT_PUBLIC_RC_OFFERING_ID;

  if (offeringId && offerings.all[offeringId]) {
    return offerings.all[offeringId];
  }

  return offerings.current ?? null;
}

/** Trigger the RC checkout sheet for a specific package. Throws on error.
 *  If firebaseUid is passed, the purchase is tied to that identity — the
 *  mobile app will see the entitlement the moment the user signs in with
 *  the same provider. No redemption links, no custom URL scheme. */
export async function purchasePackage(
  packageId: string,
  firebaseUid?: string
): Promise<PurchaseResult | null> {
  const purchases = await ensurePurchases(firebaseUid);
  if (!purchases) return null;

  const offering = await fetchOffering(firebaseUid);
  if (!offering) {
    throw new Error("No RevenueCat offering available");
  }

  const pkg: RCPackage | undefined = offering.packagesById?.[packageId] ??
    offering.availablePackages?.find((p: RCPackage) => p.identifier === packageId);

  if (!pkg) {
    const available = offering.availablePackages?.map((p: RCPackage) => p.identifier).join(", ") ?? "none";
    throw new Error(`Package not found in offering: ${packageId}. Available: ${available}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result: PurchaseResult = await (purchases as any).purchase({
    rcPackage: pkg,
  });

  return result;
}

/** Alias the current (anonymous) RC customer to the supplied Firebase UID.
 *  RC web SDK has TWO methods that look similar but behave differently:
 *    - `changeUser(id)` — swaps the user ID, does NOT create an alias.
 *      The old anonymous user keeps its entitlement, the new ID becomes
 *      a separate customer. Wrong for our handoff flow.
 *    - `identifyUser(id)` — IF the current user is anonymous, creates an
 *      alias between the anonymous ID and the new ID server-side, then
 *      switches the SDK to the new ID. Both IDs share the entitlement.
 *      Correct method for web purchase → Firebase signup → mobile app.
 *
 *  We were using `changeUser` and the alias never landed — every
 *  purchase showed up in RC as orphaned anonymous customers. Fixed by
 *  switching to `identifyUser`, with a `changeUser` fallback for any
 *  edge case where the user is somehow already non-anonymous (alias
 *  would be a no-op there anyway).
 */
export async function aliasToUser(firebaseUid: string): Promise<void> {
  if (!isConfigured()) return;
  const purchases = await ensurePurchases();
  if (!purchases) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = purchases as any;
    if (typeof p.identifyUser === "function") {
      await p.identifyUser(firebaseUid);
    } else if (typeof p.changeUser === "function") {
      // SDK pre-dates identifyUser — fall back to changeUser even though
      // it skips the alias. Better than no-op so the SDK at least points
      // to the right user going forward.
      await p.changeUser(firebaseUid);
    } else {
      // Last-resort: reconfigure with the new UID. Creates a fresh
      // customer on the new ID; alias still won't happen.
      configuredUserId = firebaseUid;
      const mod = await import("@revenuecat/purchases-js");
      const Purchases = mod.Purchases;
      const apiKey = process.env.NEXT_PUBLIC_RC_WEB_BILLING_API_KEY!;
      purchasesInstance = Purchases.configure({ apiKey, appUserId: firebaseUid });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[revenuecat] aliasToUser failed:", err);
    throw err;
  }
}

/** Type guard for the user-cancelled error case so callers can branch. */
export async function isUserCancelledError(err: unknown): Promise<boolean> {
  try {
    const { ErrorCode, PurchasesError } = await import("@revenuecat/purchases-js");
    if (err instanceof PurchasesError) {
      return (err as PurchasesError).errorCode === ErrorCode.UserCancelledError;
    }
  } catch {
    // SDK not loaded; can't tell
  }
  return false;
}
