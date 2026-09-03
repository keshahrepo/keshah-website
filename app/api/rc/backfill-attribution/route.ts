// RC → Firestore backfill for install attribution.
//
// The Appstack SDK pushes attribution data (media source, campaign, ad
// group, ad, appstack device id) directly into RevenueCat as reserved
// subscriber attributes ($mediaSource, $campaign, $adGroup, $creative)
// plus one Appstack custom key (appstack_id). Our Firestore Users doc
// never sees any of it, which means the KESHAH admin dashboards can't
// filter cohorts by paid-vs-organic.
//
// This cron reads Firestore users, calls RC per-UID to pull their
// subscriber_attributes, and writes the attribution fields back to
// Firestore + derives a coarse `install_source` for easy filtering.
//
// Schedule: daily at 05:00 UTC (1h after the sync-attributes cron so we
// don't collide with it). Auth via Vercel cron Bearer secret.
//
// One-time full backfill can be triggered by hitting this endpoint with
// ?days=90 to widen the window (default 3 days = new signups since last
// cron run).
//
// Longer term: mobile app should write install_source directly to
// Firestore at signup (proposal in ACTIVATION_PROPOSALS.md). This cron
// stays as the backfill / catch-up path for existing users + any that
// slip past the app write.

import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { requireCronSecret } from "@/lib/support/auth";

export const maxDuration = 300;

const RC_SECRET = process.env.RC_API_SECRET_KEY || "";

// RC-reserved attribution attribute keys. Appstack SDK writes these via
// its native RC integration.
const RC_KEYS = {
  mediaSource: "$mediaSource",
  campaign: "$campaign",
  adGroup: "$adGroup",
  creative: "$creative",
  keyword: "$keyword",
  appstackId: "appstack_id",
} as const;

// Binary derivation of install_source. Anything Appstack recognizes as
// a paid ad network is "paid"; everything else is "organic" — including
// missing mediaSource (App Store search / direct install / referral)
// and any unrecognized non-paid string. iOS view-through ads where
// ATT was denied will slip into organic; that's the same blind spot
// every attribution tool has, and calling it what it likely is beats
// hiding it in an "unknown" bucket that carries no decision-useful
// information.
function deriveInstallSource(mediaSource: string | null): "paid" | "organic" {
  if (!mediaSource) return "organic";
  const ms = mediaSource.toLowerCase().trim();
  const PAID = new Set([
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
    "pinterest",
    "youtube",
    "apple_search_ads",
    "applesearchads",
  ]);
  return PAID.has(ms) ? "paid" : "organic";
}

interface RcSubscriber {
  subscriber?: {
    subscriber_attributes?: Record<
      string,
      { value?: string; updated_at_ms?: number } | undefined
    >;
  };
}

async function fetchAttribution(uid: string): Promise<{
  install_source: "paid" | "organic";
  attribution_media_source: string | null;
  attribution_campaign: string | null;
  attribution_ad_group: string | null;
  attribution_ad: string | null;
  attribution_keyword: string | null;
  attribution_appstack_id: string | null;
} | null> {
  const res = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(uid)}`,
    {
      headers: { Authorization: `Bearer ${RC_SECRET}` },
    },
  );
  if (!res.ok) {
    // 404 = subscriber not in RC yet (haven't opened the app). Not an
    // error — skip.
    if (res.status === 404) return null;
    throw new Error(`RC ${res.status} for uid=${uid}`);
  }
  const body = (await res.json().catch(() => ({}))) as RcSubscriber;
  const attrs = body.subscriber?.subscriber_attributes ?? {};
  const read = (k: string): string | null =>
    typeof attrs[k]?.value === "string" && attrs[k]!.value!.length > 0
      ? attrs[k]!.value!
      : null;
  const mediaSource = read(RC_KEYS.mediaSource);
  return {
    install_source: deriveInstallSource(mediaSource),
    attribution_media_source: mediaSource,
    attribution_campaign: read(RC_KEYS.campaign),
    attribution_ad_group: read(RC_KEYS.adGroup),
    attribution_ad: read(RC_KEYS.creative),
    attribution_keyword: read(RC_KEYS.keyword),
    attribution_appstack_id: read(RC_KEYS.appstackId),
  };
}

export async function POST(req: Request) {
  if (!requireCronSecret(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!RC_SECRET) {
    return NextResponse.json({ error: "RC_API_SECRET_KEY not configured" }, { status: 500 });
  }

  const url = new URL(req.url);
  const days = Math.max(1, Math.min(365, parseInt(url.searchParams.get("days") ?? "3", 10)));
  const concurrency = Math.min(8, Math.max(1, parseInt(url.searchParams.get("concurrency") ?? "6", 10)));
  const hardCap = 5000; // protects the 300s maxDuration on big runs

  const { db } = getFirebaseAdmin();
  const since = Timestamp.fromMillis(Date.now() - days * 86_400_000);

  const snap = await db.collection("Users").where("created_at", ">=", since).get();

  type Job = { uid: string };
  const jobs: Job[] = [];
  const skipped = { deleted: 0, alreadyLabelled: 0 };
  const refresh = url.searchParams.get("refresh") === "1";

  for (const doc of snap.docs) {
    if (jobs.length >= hardCap) break;
    const d = doc.data();
    if (d.is_deleted) { skipped.deleted++; continue; }
    // Skip if we already have install_source unless ?refresh=1 forces it.
    if (!refresh && typeof d.install_source === "string" && d.install_source.length > 0) {
      skipped.alreadyLabelled++;
      continue;
    }
    jobs.push({ uid: doc.id });
  }

  let ok = 0, notFound = 0, err = 0;
  const byInstallSource: Record<string, number> = {};

  for (let i = 0; i < jobs.length; i += concurrency) {
    const slice = jobs.slice(i, i + concurrency);
    await Promise.all(
      slice.map(async ({ uid }) => {
        try {
          const attr = await fetchAttribution(uid);
          if (!attr) { notFound++; return; }
          await db.collection("Users").doc(uid).set(attr, { merge: true });
          ok++;
          byInstallSource[attr.install_source] = (byInstallSource[attr.install_source] ?? 0) + 1;
        } catch (e) {
          err++;
          console.error(`[rc/backfill-attribution] uid=${uid} err:`, e instanceof Error ? e.message : e);
        }
      }),
    );
  }

  return NextResponse.json({
    days,
    concurrency,
    scanned: snap.size,
    eligible: jobs.length,
    skipped,
    ok,
    not_found_in_rc: notFound,
    errors: err,
    by_install_source: byInstallSource,
    finished_at: new Date().toISOString(),
  });
}
