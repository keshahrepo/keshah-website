import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // Deprecated funnels — consolidating on /startus3 (US default),
    // /mandy + /c/{slug} (creators), /startindia (India), /startfree
    // (US trial). Everything else 301s to /startus3 so old links in
    // past content / SMS / email don't 404.
    return [
      { source: "/start", destination: "/startus3", permanent: true },
      // No /start/:path* wildcard — the public/start/ folder holds the
      // funnel's video poster + photos, and a wildcard would 308 every
      // asset URL (e.g. /start/aadi_hook.mp4) to /startus3, breaking
      // Hook, PinchTest, and any image preloads.
      { source: "/startus2", destination: "/startus3", permanent: true },
      { source: "/startus2/:path*", destination: "/startus3", permanent: true },
      { source: "/startindia2", destination: "/startindia", permanent: true },
      { source: "/startindia2/:path*", destination: "/startindia", permanent: true },
      { source: "/startindia3", destination: "/startindia", permanent: true },
      { source: "/startindia3/:path*", destination: "/startindia", permanent: true },
      { source: "/startindiafree", destination: "/startindia", permanent: true },
      { source: "/startindiafree2", destination: "/startindia", permanent: true },
      { source: "/tryfree", destination: "/startus3", permanent: true },
      { source: "/tryfree/:path*", destination: "/startus3", permanent: true },
      // Old legal page consolidated onto /privacy so the app link
      // (contact-footer + T&C footer under sign-up) points at one
      // canonical URL.
      { source: "/privacy-policy", destination: "/privacy", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/.well-known/apple-app-site-association",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
      {
        source: "/.well-known/assetlinks.json",
        headers: [
          { key: "Content-Type", value: "application/json" },
        ],
      },
    ];
  },
};

export default nextConfig;
