import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KESHAH — Stop Hair Loss in 60 Days Without Drugs",
  description:
    "Daily scalp mechanotherapy exercises that stop hair loss in 60 days. 6 video-guided techniques, 20 minutes a day. Try free for 3 days.",
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
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
