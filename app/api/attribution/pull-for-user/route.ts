// Signup-time attribution pull. Mobile fires this immediately after
// AuthRepo.createUser completes; server reads RC's subscriber_attributes
// (which mobile has already populated on cold-start via
// Purchases.setAppstackAttributionParams) and writes campaign +
// install_source to the user's Firestore doc.
//
// This is the same read-from-RC → write-to-Firestore path the RC webhook
// uses on paid events. The difference is trigger: RC only fires webhooks
// on subscription lifecycle events, so signup is invisible to it. Mobile
// pings us here to close that gap without waiting for the nightly cron.
//
// Not idempotent-blocking — if attribution isn't in RC yet (Appstack
// hasn't resolved), we no-op. The nightly cron catches those later.

import { NextResponse } from "next/server";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

export const runtime = "nodejs";
export const maxDuration = 15;

const RC_SECRET = process.env.RC_API_SECRET_KEY || "";

const RC_KEYS = {
  mediaSource: "$mediaSource",
  campaign: "$campaign",
  adGroup: "$adGroup",
  creative: "$creative",
  keyword: "$keyword",
  appstackId: "appstack_id",
} as const;

// Same paid-vs-organic classifier used in /api/rc/backfill-attribution
// and the mobile mirror — keep in sync when adding networks.
const PAID_MEDIA_SOURCES = new Set([
  "meta", "facebook", "facebook_ads", "instagram", "google", "google_ads",
  "googleadwords_int", "tiktok", "tiktok_ads", "snap", "snapchat",
  "twitter", "reddit", "pinterest", "youtube", "apple_search_ads", "applesearchads",
]);
function deriveInstallSource(mediaSource: string | null): "paid" | "organic" {
  if (!mediaSource) return "organic";
  return PAID_MEDIA_SOURCES.has(mediaSource.toLowerCase().trim()) ? "paid" : "organic";
}

export async function POST(req: Request) {
  if (!RC_SECRET) {
    return NextResponse.json({ error: "RC_API_SECRET_KEY not configured" }, { status: 500 });
  }
  let body: { uid?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const uid = (body.uid ?? "").trim();
  if (!uid || uid.length > 128 || /[/.]/.test(uid)) {
    return NextResponse.json({ error: "invalid_uid" }, { status: 400 });
  }

  try {
    const rcRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
      { headers: { Authorization: `Bearer ${RC_SECRET}` } },
    );
    if (!rcRes.ok) {
      // 404 = subscriber not registered yet with RC (client hasn't
      // called Purchases.configure with this uid yet). Not an error —
      // client is expected to retry after ATT/first identify.
      if (rcRes.status === 404) {
        return NextResponse.json({ ok: true, skipped: "rc_not_found" });
      }
      return NextResponse.json({ error: `rc_${rcRes.status}` }, { status: 502 });
    }
    const sub = (await rcRes.json()) as {
      subscriber?: {
        subscriber_attributes?: Record<string, { value?: string } | undefined>;
      };
    };
    const attrs = sub.subscriber?.subscriber_attributes ?? {};
    const read = (k: string): string | null => {
      const v = attrs[k]?.value;
      return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
    };
    const mediaSource = read(RC_KEYS.mediaSource);
    const patch: Record<string, unknown> = {
      attribution_media_source: mediaSource,
      attribution_campaign: read(RC_KEYS.campaign),
      attribution_ad_group: read(RC_KEYS.adGroup),
      attribution_ad: read(RC_KEYS.creative),
      attribution_keyword: read(RC_KEYS.keyword),
      attribution_appstack_id: read(RC_KEYS.appstackId),
      install_source: deriveInstallSource(mediaSource),
    };

    // Skip write entirely if RC has nothing yet — a null-write would
    // stomp any older data + adds noise. Backfill cron will retry.
    const hasAnyRealSignal =
      patch.attribution_campaign !== null ||
      patch.attribution_media_source !== null ||
      patch.attribution_appstack_id !== null;
    if (!hasAnyRealSignal) {
      return NextResponse.json({ ok: true, skipped: "no_attribution_yet" });
    }

    // Filter nulls out of the patch so we never overwrite good data
    // with null on a partial resolve.
    const cleanPatch: Record<string, unknown> = {
      install_source: patch.install_source,
      attribution_pulled_at: FieldValue.serverTimestamp(),
      attribution_pull_source: "signup_ping_v1",
    };
    for (const k of [
      "attribution_media_source",
      "attribution_campaign",
      "attribution_ad_group",
      "attribution_ad",
      "attribution_keyword",
      "attribution_appstack_id",
    ] as const) {
      if (patch[k] !== null) cleanPatch[k] = patch[k];
    }

    const { db } = getFirebaseAdmin();
    await db.collection("Users").doc(uid).set(cleanPatch, { merge: true });

    return NextResponse.json({
      ok: true,
      campaign: patch.attribution_campaign ?? null,
      media_source: mediaSource,
      install_source: patch.install_source,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
