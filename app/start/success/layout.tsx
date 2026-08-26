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
export default function SuccessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
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
