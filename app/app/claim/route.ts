/**
 * /app/claim — deferred-deep-link fallback for post-payment app handoff.
 *
 * How the handoff normally works:
 *   - After Stripe checkout, /start/success renders a CTA linking to
 *     https://www.keshah.com/app/claim?ft=<token>&uid=<uid>
 *   - On iOS the OS matches this against /.well-known/apple-app-site-association
 *     (paths include /app/claim*) → opens the KESHAH app directly. On Android,
 *     assetlinks.json does the same. In both cases this route handler is NEVER
 *     invoked because the OS intercepts before hitting the browser.
 *
 * When this handler DOES run (the fallback path):
 *   - The user opened the CTA inside an in-app browser (TikTok, Instagram,
 *     Facebook, Gmail) that doesn't honour Universal Links, OR
 *   - The user doesn't have the app installed yet.
 *   - In both cases we need to (a) preserve the token across the App Store
 *     hop — Meta/TikTok in-app browsers strip query params during the store
 *     redirect — and (b) send the user to the right store.
 *
 * Preservation: signed HttpOnly cookie `keshah_claim` (1h). After install +
 * first launch, the app opens www.keshah.com/app/claim (no params) in
 * ASWebAuthenticationSession — the request carries the cookie, and a
 * companion route (built by mobile agent) reads + verifies it, returning the
 * token to the app. That token is then used to signInWithCustomToken().
 *
 * Signing: HMAC-SHA256 with KESHAH_CLAIM_COOKIE_SECRET. Cookie value is
 * base64url(JSON({ft,uid,exp})) + "." + base64url(hmac). Verification lives
 * on the read side. If the secret env var is missing we still redirect the
 * user (so payment isn't lost) but skip cookie set + log an error — the app
 * will fall back to prompting the user to tap the email link.
 */

import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

export const dynamic = "force-dynamic";

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6450676544";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

const COOKIE_NAME = "keshah_claim";
const COOKIE_MAX_AGE_SECONDS = 60 * 60; // 1h — matches customTokenTtlSeconds

function detectPlatform(ua: string): "ios" | "android" | "desktop" {
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Signed cookie payload: base64url(JSON({ft,uid,exp})).base64url(hmac).
 * Returns null when the signing secret isn't configured — caller redirects
 * the user anyway so we don't strand a paying customer on a blank screen.
 */
function buildSignedClaimCookie(
  ft: string,
  uid: string,
): { value: string; expSeconds: number } | null {
  const secret = process.env.KESHAH_CLAIM_COOKIE_SECRET;
  if (!secret) {
    console.error(
      "[app/claim] KESHAH_CLAIM_COOKIE_SECRET missing — skipping cookie set",
    );
    return null;
  }
  const expSeconds = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE_SECONDS;
  const payload = b64url(JSON.stringify({ ft, uid, exp: expSeconds }));
  const sig = b64url(
    createHmac("sha256", secret).update(payload).digest(),
  );
  return { value: `${payload}.${sig}`, expSeconds };
}

function desktopFallbackHtml(hasParams: boolean): string {
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
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 24px;}
  .stores{display:flex;flex-direction:column;gap:12px;}
  .store{display:flex;align-items:center;justify-content:center;padding:14px 22px;background:#fff;color:#000;text-decoration:none;border-radius:12px;font-weight:600;font-size:15px;}
  .signature{margin-top:32px;font-size:13px;color:rgba(255,255,255,0.4);}
</style>
</head>
<body>
  <div class="card">
    <h1>Please open this link on your phone</h1>
    <p>${
      hasParams
        ? "Your KESHAH account is ready. Open this same link on your iPhone or Android phone to launch the app."
        : "The KESHAH app lives on iPhone and Android. Install it below and sign in with the email you used at checkout."
    }</p>
    <div class="stores">
      <a class="store" href="${APP_STORE_URL}">Download on the App Store</a>
      <a class="store" href="${PLAY_STORE_URL}">Get it on Google Play</a>
    </div>
    <div class="signature">— Aadi, KESHAH founder</div>
  </div>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const ft = req.nextUrl.searchParams.get("ft") ?? "";
  const uid = req.nextUrl.searchParams.get("uid") ?? "";
  const ua = req.headers.get("user-agent") || "";
  const platform = detectPlatform(ua);

  // Only build a cookie when we actually have a token to preserve. Missing
  // params is legitimate (post-install callback opening the same URL to read
  // the cookie back).
  const cookie = ft && uid ? buildSignedClaimCookie(ft, uid) : null;

  // Desktop → static "open on your phone" fallback, no redirect.
  if (platform === "desktop") {
    const res = new NextResponse(desktopFallbackHtml(Boolean(ft && uid)), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    if (cookie) {
      res.cookies.set({
        name: COOKIE_NAME,
        value: cookie.value,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: COOKIE_MAX_AGE_SECONDS,
      });
    }
    return res;
  }

  // Mobile → send them to the App Store / Play Store. Serve HTML (not a 302)
  // for the same reason /app/route.ts does: TikTok / Instagram in-app browsers
  // don't honour cross-scheme 302s, and we also need to render even if the
  // universal link failed to open the app.
  const primary = platform === "ios" ? APP_STORE_URL : PLAY_STORE_URL;
  const nativeScheme =
    platform === "ios"
      ? primary.replace(
          /^https?:\/\/apps\.apple\.com/,
          "itms-apps://apps.apple.com",
        )
      : primary.replace(
          /^https?:\/\/play\.google\.com/,
          "market://play.google.com",
        );
  const platformLabel = platform === "ios" ? "App Store" : "Google Play";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Opening KESHAH…</title>
<style>
  body{margin:0;background:#000;color:#fff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;}
  .card{max-width:400px;width:100%;text-align:center;}
  h1{font-size:22px;letter-spacing:-0.4px;margin:0 0 12px;font-weight:700;}
  p{color:rgba(255,255,255,0.7);font-size:15px;line-height:1.5;margin:0 0 24px;}
  .cta{display:block;padding:18px 22px;background:#fff;color:#000;text-decoration:none;border-radius:14px;font-weight:600;font-size:17px;}
  .cta:active{transform:scale(0.98);}
  .hint{margin-top:16px;font-size:13px;color:rgba(255,255,255,0.4);}
</style>
</head>
<body>
  <div class="card">
    <h1>Opening KESHAH…</h1>
    <p>Install the app to finish setting up your account. Sign in with the email you used at checkout — we'll do the rest.</p>
    <a class="cta" id="storelink" href="${primary}">Open ${platformLabel}</a>
    <div class="hint">Not opening? Tap the button above.</div>
  </div>
<script>
  (function(){
    var native = ${JSON.stringify(nativeScheme)};
    var https = ${JSON.stringify(primary)};
    try { window.location.href = native; } catch(e) {}
    setTimeout(function(){
      try { window.location.href = https; } catch(e) {}
    }, 600);
  })();
</script>
</body>
</html>`;

  const res = new NextResponse(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
  if (cookie) {
    res.cookies.set({
      name: COOKIE_NAME,
      value: cookie.value,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: COOKIE_MAX_AGE_SECONDS,
    });
  }
  return res;
}
