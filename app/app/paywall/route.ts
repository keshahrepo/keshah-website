import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// GET /app/paywall?s=<sender>&u=<uid>&c=<campaign>&ch=<channel>
//
// The outreach link we paste into 1:1 lead conversations. Its job is to
// drop a warm lead straight onto the trial paywall.
//
// THIS HANDLER IS THE FALLBACK PATH, NOT THE MAIN ONE.
//
// /app/* is listed in public/.well-known/apple-app-site-association, so
// on iOS with the app installed the OS intercepts the tap and opens the
// app directly -- this code never runs. Same on Android once the
// manifest registers www.keshah.com + /app (see AndroidManifest.xml).
// That is the intended, happy path: no interstitial, no prompt.
//
// So reaching this handler means one of:
//   1. The app isn't installed        -> send them to the store.
//   2. An in-app browser (Instagram, TikTok) hijacked the universal
//      link -> try the keshah://paywall scheme, which those browsers
//      do honour, then fall back to the store.
//
// ATTRIBUTION: the app stamps the click itself when it consumes the
// link, because in the happy path the OS skipped us entirely. This
// handler stamps too, for the cases above, using the SAME fields so
// both paths produce one comparable dataset. `u` is what makes that
// possible here -- the app can read the logged-in user, we can't.
//
// NB: /nurture has this same shape but stamps ONLY here, and /nurture
// is in the AASA -- so its click data silently represents just the
// visitors WITHOUT the app. Don't copy that pattern.

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6450676544";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";
const APP_SCHEME_URL = "keshah://paywall";

// Time to let the custom scheme take over before assuming the app isn't
// there. The visibilitychange listener cancels the store hop as soon as
// the app foregrounds, so an installed user is never sent to the store.
const STORE_FALLBACK_MS = 1600;

export const dynamic = "force-dynamic";

function detectPlatform(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Namespaced `outreach_*` so it can never collide with Appstack's install
 * attribution (`install_source`, `attribution_media_source`, ...). Those
 * answer "where did this user come from"; these answer "who got them over
 * the line". A lead can legitimately have both -- installed off a creator
 * video, converted by a 1:1 message -- and neither should overwrite the
 * other.
 */
async function writeClickStamp(
  uid: string,
  sender: string,
  channel: string,
  campaign: string | null,
  platform: string
) {
  try {
    const { db } = getFirebaseAdmin();
    const ref = db.collection("Users").doc(uid);
    const snap = await ref.get();
    if (!snap.exists) {
      console.warn(`[outreach-click] no user doc for uid=${uid}`);
      return;
    }
    const existing = snap.data() ?? {};
    const now = Timestamp.now();

    const patch: Record<string, unknown> = {
      outreach_click: {
        sender,
        channel,
        campaign,
        platform,
        source: "web_fallback",
        at: now,
      },
      outreach_last_click_at: now,
      outreach_click_count: FieldValue.increment(1),
    };
    // First touch is what earns credit, so never overwrite it.
    if (!existing.outreach_first_click_at) {
      patch.outreach_first_click_at = now;
      patch.outreach_first_click_sender = sender;
    }

    await ref.set(patch, { merge: true });
  } catch (e) {
    // Attribution must never break the redirect.
    console.error("[outreach-click] Firestore write failed", e);
  }
}

function bouncePage(platform: "ios" | "android"): string {
  const storeUrl = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
  const storeLabel = platform === "ios" ? "App Store" : "Google Play";

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Opening KESHAH</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:400px;width:100%;text-align:center;}
  h1{font-size:24px;letter-spacing:-0.4px;margin:0 0 12px;font-weight:700;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 28px;}
  .cta{display:block;padding:18px 22px;background:#fff;color:#000;text-decoration:none;border-radius:14px;font-weight:700;font-size:17px;}
  .cta:active{transform:scale(0.98);}
  .alt{display:inline-block;margin-top:20px;font-size:13px;color:rgba(255,255,255,0.45);text-decoration:underline;}
</style>
</head>
<body>
  <div class="card">
    <h1>Opening KESHAH</h1>
    <p>This should only take a second.</p>
    <a class="cta" href="${APP_SCHEME_URL}">Open KESHAH</a>
    <a class="alt" href="${storeUrl}">Don't have the app? Get it on the ${storeLabel}</a>
  </div>
<script>
  (function(){
    var app = ${JSON.stringify(APP_SCHEME_URL)};
    var store = ${JSON.stringify(storeUrl)};
    var jumped = false;

    // If the app takes over, this page is backgrounded -- cancel the store
    // hop so an installed user is never dumped into the store.
    function cancel(){ jumped = true; }
    document.addEventListener("visibilitychange", function(){
      if (document.hidden) cancel();
    });
    window.addEventListener("pagehide", cancel);
    window.addEventListener("blur", cancel);

    try { window.location.href = app; } catch(e) {}

    setTimeout(function(){
      if (jumped || document.hidden) return;
      try { window.location.replace(store); } catch(e) {}
    }, ${STORE_FALLBACK_MS});
  })();
</script>
</body>
</html>`;
}

function desktopPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Open KESHAH on your phone</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:440px;width:100%;text-align:center;}
  h1{font-size:26px;letter-spacing:-0.5px;margin:0 0 12px;font-weight:700;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 28px;}
  .stores{display:flex;flex-direction:column;gap:12px;}
  .store{display:flex;align-items:center;justify-content:center;padding:14px 22px;background:#fff;color:#000;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;}
  .store .platform{opacity:0.5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-right:auto;}
  .store .label{margin:0 auto;}
  .signature{margin-top:32px;font-size:13px;color:rgba(255,255,255,0.4);}
</style>
</head>
<body>
  <div class="card">
    <h1>Open KESHAH on your phone</h1>
    <p>Your plan lives in the app. Open this link on the phone you installed KESHAH on, or install it below.</p>
    <div class="stores">
      <a class="store" href="${APP_STORE_URL}">
        <span class="platform">iPhone</span>
        <span class="label">Download on the App Store</span>
      </a>
      <a class="store" href="${PLAY_STORE_URL}">
        <span class="platform">Android</span>
        <span class="label">Get it on Google Play</span>
      </a>
    </div>
    <div class="signature">— Aadi, KESHAH founder</div>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const uid = (params.get("u") || "").trim();
  const sender = (params.get("s") || "unknown").trim();
  const channel = (params.get("ch") || "imessage").trim();
  const campaign = (params.get("c") || "").trim() || null;

  // ?platform=ios|android bypasses user-agent sniffing, for testing from a
  // desktop browser.
  const forced = params.get("platform");
  const platform: "ios" | "android" | "desktop" =
    forced === "ios" || forced === "android"
      ? forced
      : detectPlatform(req.headers.get("user-agent") || "");

  // waitUntil rather than fire-and-forget: an un-awaited promise can be
  // killed when the response returns, and the stamp is the point.
  if (uid) {
    waitUntil(writeClickStamp(uid, sender, channel, campaign, platform));
  }

  const html = platform === "desktop" ? desktopPage() : bouncePage(platform);

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Never let a CDN or in-app browser serve a stale bounce page.
      "cache-control": "no-store, max-age=0",
    },
  });
}
