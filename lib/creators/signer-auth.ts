/**
 * How an e-signer was signed in when they signed (contract + W-9 / W-8BEN
 * audit trails). Recorded at signing from the request's credential, so the
 * certificate states what actually happened instead of a fixed sentence.
 *
 *   app_email_code  KESHAH Creators app, signed in with a 6-digit code emailed to them
 *   app_google      app, Google sign-in tied to that email
 *   app_apple       app, Sign in with Apple tied to that email
 *   app_social      app, Google or Apple sign-in (provider not recorded)
 *   app_demo        app, App Review demo account (fixed code)
 *   app             app session issued before the method was recorded
 *   web_password    keshah.com creator portal, email + password (password set through a one-time emailed link)
 */
import type { MobileClaims } from "@/lib/mobile/token";

export type SignerAuth = "app_email_code" | "app_google" | "app_apple" | "app_social" | "app_demo" | "app" | "web_password";

export function signerAuthFromClaims(claims: MobileClaims | null): SignerAuth {
  if (!claims) return "web_password";
  switch (claims.amr) {
    case "email_code":
      return "app_email_code";
    case "google":
      return "app_google";
    case "apple":
      return "app_apple";
    case "social":
      return "app_social";
    case "demo":
      return "app_demo";
    default:
      return "app";
  }
}

/** The audit-certificate sentence for a recorded method (records from before this existed say so). */
export function signerAuthText(a: string | undefined | null): string {
  switch (a) {
    case "app_email_code":
      return "Signed in to the KESHAH Creators app with a one-time 6-digit code emailed to the signer's email address.";
    case "app_google":
      return "Signed in to the KESHAH Creators app with Google, using an account tied to the signer's email address.";
    case "app_apple":
      return "Signed in to the KESHAH Creators app with Sign in with Apple, using an account tied to the signer's email address.";
    case "app_social":
      return "Signed in to the KESHAH Creators app with Google or Apple sign-in, using an account tied to the signer's email address.";
    case "app_demo":
      return "Signed in to the KESHAH Creators app with the App Review demo account.";
    case "app":
      return "Signed in to the KESHAH Creators app as the signer's email address (sign-in by a one-time code emailed to that address, or Google / Apple sign-in tied to it; the exact method wasn't recorded for this session).";
    case "web_password":
      return "Signed in to the KESHAH creator website with the signer's email address and password (set through a one-time link emailed to that address).";
    default:
      return "Signed in to the signer's own KESHAH creator account, tied to the email address above (method not recorded at signing).";
  }
}
