import { NextRequest, NextResponse } from "next/server";

// GET /app
//
// Bio-link auto-redirect for TikTok / Instagram traffic.
//  - iOS device   → 302 to App Store
//  - Android      → 302 to Play Store
//  - Desktop      → server-rendered fallback page with both store buttons
//
// Called from the KESHAH TikTok + Instagram bio link. Removes the extra
// "which store?" click that keshah.com currently forces on mobile users.

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6450676544";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

function detectPlatform(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export async function GET(req: NextRequest) {
  // Optional ?platform=ios|android forces a specific store, bypassing user-agent
  // detection. Used by the /m page's per-button links so the Android button always
  // goes to Play Store regardless of the visitor's device.
  const forced = req.nextUrl.searchParams.get("platform");
  const platform: "ios" | "android" | "desktop" =
    forced === "ios" || forced === "android"
      ? forced
      : detectPlatform(req.headers.get("user-agent") || "");

  // Mobile: serve HTML that tries to open the store via JS + shows a visible fallback button.
  //   - A plain 302 works in Safari/Chrome but is BLOCKED by TikTok / Instagram in-app browsers
  //     (they don't trigger iOS universal links from server redirects).
  //   - The HTML tries the itms-apps:// scheme first (direct native), falls back to the https
  //     universal link, and always shows a big tap-me button so the user can force it manually.
  if (platform === "ios" || platform === "android") {
    const primary = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
    // itms-apps://...id6450676544 style URL that forces the App Store app on iOS.
    // For Android, market:// does the same for Play Store.
    const nativeScheme = platform === "ios"
      ? primary.replace(/^https?:\/\/apps\.apple\.com/, "itms-apps://apps.apple.com")
      : primary.replace(/^https?:\/\/play\.google\.com/, "market://play.google.com");
    const platformLabel = platform === "ios" ? "App Store" : "Google Play";
    const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Get KESHAH</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:400px;width:100%;text-align:center;}
  h1{font-size:24px;letter-spacing:-0.4px;margin:0 0 12px;font-weight:700;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 28px;}
  .cta{display:block;padding:18px 22px;background:#fff;color:#000;text-decoration:none;border-radius:14px;font-weight:700;font-size:17px;}
  .cta:active{transform:scale(0.98);}
  .hint{margin-top:20px;font-size:13px;color:rgba(255,255,255,0.4);}
</style>
</head>
<body>
  <div class="card">
    <h1>Get KESHAH</h1>
    <p>Tap below to open the ${platformLabel}.</p>
    <a class="cta" id="storelink" href="${primary}">Open ${platformLabel}</a>
    <div class="hint">Not opening? Tap the link above.</div>
  </div>
<script>
  // Try native scheme first (forces the app to open, bypasses in-app browser redirect blocks).
  // Fall back to the https universal link ~600ms later if native didn't take over.
  (function(){
    var native = ${JSON.stringify(nativeScheme)};
    var https = ${JSON.stringify(primary)};
    try { window.location.href = native; } catch(e) {}
    setTimeout(function(){
      // If we're still here, native scheme didn't open the store — try https link.
      try { window.location.href = https; } catch(e) {}
    }, 600);
  })();
</script>
</body>
</html>`;
    return new NextResponse(html, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // Desktop → server-render a proper landing page.
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Get KESHAH</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:440px;width:100%;text-align:center;}
  h1{font-size:26px;letter-spacing:-0.5px;margin:0 0 12px;font-weight:700;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 28px;}
  .stores{display:flex;flex-direction:column;gap:12px;}
  .store{display:flex;align-items:center;justify-content:center;padding:14px 22px;background:#fff;color:#000;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;transition:transform 0.1s;}
  .store:hover{transform:translateY(-1px);}
  .store .platform{opacity:0.5;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin-right:auto;}
  .store .label{margin:0 auto;}
  .signature{margin-top:32px;font-size:13px;color:rgba(255,255,255,0.4);}
</style>
</head>
<body>
  <div class="card">
    <h1>Get KESHAH on your phone</h1>
    <p>The routine that stops hair loss without drugs. Tap one of these to install.</p>
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

  return new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
