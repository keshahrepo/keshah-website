import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    // All old funnel variants collapsed onto /start (the single
    // mobile-parity funnel). Any legacy URL from past ads / SMS / email
    // 301s to /start so nothing 404s.
    //
    // Marked `permanent: false` (307) so ad platforms + browsers don't
    // permanently cache the redirect — leaves room to change destinations
    // later without users being stuck on cached 308s.
    return [
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
    ];
  },
};

export default nextConfig;
