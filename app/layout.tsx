import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const FB_PIXEL_ID = process.env.NEXT_PUBLIC_FB_PIXEL_ID;
const TIKTOK_PIXEL_ID =
  process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID || "D7QJ3C3C77U44OJIQ44G";

export const metadata: Metadata = {
  title: "KESHAH — Stop Hair Loss in 60 Days Without Drugs",
  description:
    "Daily scalp mechanotherapy exercises that stop hair loss in 60 days. Video-guided techniques, 20 minutes a day.",
  keywords: [
    "hair loss",
    "stop hair loss",
    "hair loss treatment",
    "scalp massage",
    "mechanotherapy",
    "natural hair loss treatment",
  ],
  openGraph: {
    title: "Stop Your Hair Loss in 60 Days",
    description:
      "The exact routine I used to fix my hair loss. Without drugs. Without surgery.",
    url: "https://keshah.com",
    siteName: "KESHAH",
    type: "website",
    images: [
      {
        url: "https://keshah.com/images/logo.png",
        alt: "KESHAH",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "Stop Your Hair Loss in 60 Days",
    description: "Without drugs. Without surgery. Just 20 minutes a day.",
    images: ["https://keshah.com/images/logo.png"],
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#000000" />
        <link rel="apple-touch-icon" href="/images/logo.png" />
        {/* Preload Poppins so the browser starts fetching in parallel with
            HTML — without this, fonts download only after CSS is parsed and
            an element needs them, causing a visible fallback → Poppins swap
            on the Hook and first few steps. */}
        <link
          rel="preload"
          href="/fonts/Poppins-Regular.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Poppins-Medium.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Poppins-SemiBold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Poppins-Bold.ttf"
          as="font"
          type="font/ttf"
          crossOrigin="anonymous"
        />
      </head>
      <body>
        {/* Facebook Pixel base script — initializes the SDK but only fires
            PageView on /start (the funnel). Other pages load the SDK silently
            so events fired from JS (Lead, Purchase, etc.) still work if the
            user somehow navigates. */}
        {FB_PIXEL_ID && (
          <>
            <Script
              id="fb-pixel"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  !function(f,b,e,v,n,t,s)
                  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
                  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
                  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
                  n.queue=[];t=b.createElement(e);t.async=!0;
                  t.src=v;s=b.getElementsByTagName(e)[0];
                  s.parentNode.insertBefore(t,s)}(window, document,'script',
                  'https://connect.facebook.net/en_US/fbevents.js');
                  fbq('init', '${FB_PIXEL_ID}');
                  if(window.location.pathname.startsWith('/start')||window.location.pathname.startsWith('/tryfree')||window.location.pathname.startsWith('/mandy')||window.location.pathname.startsWith('/f/')||window.location.pathname.startsWith('/watch')){fbq('track','PageView');}
                `,
              }}
            />
            <noscript>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                height="1"
                width="1"
                style={{ display: "none" }}
                alt=""
                src={`https://www.facebook.com/tr?id=${FB_PIXEL_ID}&ev=PageView&noscript=1`}
              />
            </noscript>
          </>
        )}
        {/* TikTok Pixel — initializes the SDK and fires PageView on every
            page load. Pixel ID can be overridden via NEXT_PUBLIC_TIKTOK_PIXEL_ID
            env var; defaults to the production pixel inline. */}
        {TIKTOK_PIXEL_ID && (
          <Script
            id="tiktok-pixel"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                !function (w, d, t) {
                  w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=document.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=document.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
                  ttq.load('${TIKTOK_PIXEL_ID}');
                  ttq.page();
                }(window, document, 'ttq');
              `,
            }}
          />
        )}
        {/* Ad-click + UTM attribution capture. Runs once on every page load
            before any tracking events fire. Reads ttclid / utm_* from the
            current URL and writes them to first-party cookies (30 days) so
            later events on different pages — most importantly the Purchase
            event fired from PlanModal — can recover the ad-click ID even
            after the user has navigated away from the original landing URL.
            Without this, the TikTok Events API can't match conversions
            back to ad clicks for users who refresh / re-enter the funnel. */}
        <Script
          id="ad-attribution-capture"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var qs = new URLSearchParams(window.location.search);
                  var params = ['ttclid','fbclid','utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
                  var maxAge = 60*60*24*30; // 30 days
                  for (var i=0; i<params.length; i++) {
                    var key = params[i];
                    var val = qs.get(key);
                    if (val) {
                      document.cookie = key + '=' + encodeURIComponent(val) + '; Max-Age=' + maxAge + '; Path=/; SameSite=Lax';
                    }
                  }
                } catch(e) {}
              })();
            `,
          }}
        />
        {/* Microsoft Clarity — session replay + heatmaps. Free, privacy-
            friendly, helps diagnose why cold paid traffic bounces on hook
            (autoplay broken? slow load? message confusion?). Project ID
            wog4d0awf7. Loaded afterInteractive so it doesn't block first
            paint on the funnel. */}
        <Script
          id="ms-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function(c,l,a,r,i,t,y){
                c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
                t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
                y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
              })(window, document, "clarity", "script", "wog4d0awf7");
            `,
          }}
        />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
