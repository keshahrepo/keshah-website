import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The contract sign route reads the signature font from disk
  // (lib/creators/contract.ts); make sure it ships in that function's bundle.
  outputFileTracingIncludes: {
    "/api/creator/contract/sign": ["./lib/creators/fonts/**/*"],
    // Tax forms fill the official IRS PDFs and stamp the same signature font
    // (lib/creators/tax-forms.ts).
    "/api/creator/payment/tax/sign": ["./lib/creators/fonts/**/*", "./lib/creators/forms/**/*"],
    "/api/creator/payment/tax/preview": ["./lib/creators/fonts/**/*", "./lib/creators/forms/**/*"],
  },
  async redirects() {
    // All old funnel variants collapsed onto /start (the single
    // mobile-parity funnel). Any legacy URL from past ads / SMS / email
    // 301s to /start so nothing 404s.
    //
    // Marked `permanent: false` (307) so ad platforms + browsers don't
    // permanently cache the redirect — leaves room to change destinations
    // later without users being stuck on cached 308s.
    return [
      // /l used to be the standalone landing page; now baked in as the
      // first step of /start.
      { source: "/l", destination: "/start", permanent: false },
      { source: "/startus3", destination: "/start", permanent: false },
      { source: "/startus2", destination: "/start", permanent: false },
      { source: "/startus2/:path*", destination: "/start", permanent: false },
      { source: "/startfree", destination: "/start", permanent: false },
      { source: "/startindia", destination: "/start", permanent: false },
      { source: "/startindia2", destination: "/start", permanent: false },
      { source: "/startindia2/:path*", destination: "/start", permanent: false },
      { source: "/startindia3", destination: "/start", permanent: false },
      { source: "/startindia3/:path*", destination: "/start", permanent: false },
      { source: "/startindiafree", destination: "/start", permanent: false },
      { source: "/startindiafree2", destination: "/start", permanent: false },
      { source: "/tryfree", destination: "/start", permanent: false },
      { source: "/tryfree/:path*", destination: "/start", permanent: false },
      // Old legal page consolidated onto /privacy.
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
      // The booked-page story images and video: versioned with ?v=, so cache them for a year.
      {
        source: "/creator-call/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
