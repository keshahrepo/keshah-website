import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "You're in — KESHAH",
  description:
    "Welcome to KESHAH. Open the app on your phone to start your daily scalp routine.",
  robots: { index: false, follow: false },
};

// Load Apple's Sign in with Apple JS + Google Identity Services here.
// Both SDKs render the provider's native sign-in sheet directly on our
// page (no Firebase OAuth handler URL, no blank grey page in between).
// See firebase-client.ts → signInWithAppleNative / signInWithGoogleNative.
//
// Preconnect to the auth origins so TLS + connection handshake to Apple
// / Google are already done by the time the user taps a button. Shaves
// 200-500ms off the popup-open time — enough that mobile Safari doesn't
// block the main thread long enough for the button spinner to feel
// delayed.
export default function SuccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <link rel="preconnect" href="https://appleid.apple.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://appleid.cdn-apple.com" crossOrigin="anonymous" />
      <link rel="preconnect" href="https://accounts.google.com" crossOrigin="anonymous" />
      <link rel="dns-prefetch" href="https://appleid.apple.com" />
      <link rel="dns-prefetch" href="https://accounts.google.com" />
      <Script
        src="https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js"
        strategy="afterInteractive"
      />
      <Script
        src="https://accounts.google.com/gsi/client"
        strategy="afterInteractive"
      />
      {children}
    </>
  );
}
