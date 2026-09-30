// Shared helpers for extracting attribution fields from a RevenueCat
// subscriber_attributes bag — used by both the RC webhook (real-time)
// and the nightly backfill script (safety net).
//
// Attribution flow: Appstack SDK on device → Appstack posts to RC's
// $mediaSource / $campaign / $adGroup / $creative / $keyword standard
// attrs + custom appstack_campaign / appstack_id → RC exposes them in
// the /v1/subscribers API AND on every webhook event's
// `subscriber_attributes` map.

export interface AttributionAttrs {
  mediaSource: string | null;
  campaign: string | null;
  adGroup: string | null;
  ad: string | null;
  keyword: string | null;
  appstackId: string | null;
}

// Extract the six attribution values from a RC subscriber_attributes
// map (from either the webhook event or the API response). Falls back
// to Appstack-custom keys where the standard $-prefixed ones are empty.
export function extractAttrs(
  raw: Record<string, { value?: string }> | undefined,
): AttributionAttrs {
  const attrs = raw ?? {};
  const pick = (k: string): string | null => {
    const v = attrs[k]?.value;
    return typeof v === "string" && v.length ? v : null;
  };
  return {
    mediaSource: pick("$mediaSource"),
    campaign: pick("$campaign") ?? pick("appstack_campaign"),
    adGroup: pick("$adGroup"),
    ad: pick("$ad") ?? pick("$creative"),
    keyword: pick("$keyword"),
    appstackId: pick("$appstackId") ?? pick("appstack_id"),
  };
}

// Ad networks we treat as "paid" — matches the derivation in
// /api/rc/backfill-attribution. Anything else (including missing) is
// "organic". iOS view-through where ATT was denied slips into organic;
// same blind spot every attribution tool has.
const PAID_NETWORKS = new Set([
  "meta",
  "facebook",
  "facebook_ads",
  "instagram",
  "google",
  "google_ads",
  "googleadwords_int",
  "tiktok",
  "tiktok_ads",
  "snap",
  "snapchat",
  "twitter",
  "reddit",
  "youtube",
  "applesearchads",
  "apple_search_ads",
  "asa",
]);

export function deriveInstallSource(
  mediaSource: string | null,
): "paid" | "organic" {
  if (!mediaSource) return "organic";
  const ms = mediaSource.toLowerCase().trim();
  for (const n of PAID_NETWORKS) {
    if (ms === n || ms.startsWith(n + "_") || ms.includes(n)) return "paid";
  }
  return "organic";
}

// Build the Firestore update patch for a user doc based on RC attrs.
// Null fields are stripped so we don't overwrite existing non-null
// values (e.g. Isai attribution once set shouldn't get cleared by a
// later event with an empty subscriber_attributes bag).
export function attributionPatch(
  attrs: AttributionAttrs,
): Record<string, string> {
  const patch: Record<string, string | null> = {
    install_source: deriveInstallSource(attrs.mediaSource),
    attribution_media_source: attrs.mediaSource,
    attribution_campaign: attrs.campaign,
    attribution_ad_group: attrs.adGroup,
    attribution_ad: attrs.ad,
    attribution_keyword: attrs.keyword,
    attribution_appstack_id: attrs.appstackId,
  };
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v != null) out[k] = v;
  }
  return out;
}
