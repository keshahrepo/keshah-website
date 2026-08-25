/**
 * /start/success — post-Stripe-checkout landing page.
 *
 * Flow:
 *   1. Stripe redirects here with ?session=<checkout_session_id> once payment
 *      succeeds.
 *   2. The Stripe webhook (POST /api/stripe/subscription/webhook) — verified
 *      via STRIPE_SUBSCRIPTION_WEBHOOK_SECRET on that route — creates the
 *      Firebase Auth user + seeds the User doc + writes a short-lived custom
 *      token into PendingClaims/<sessionId>.
 *   3. This page reads PendingClaims/<sessionId> server-side (via
 *      firebase-admin — the token NEVER touches the browser as a JSON blob;
 *      it only leaves this server embedded in the universal-link URL we hand
 *      to the user).
 *   4. Single big CTA: "Open KESHAH app" → deep link
 *      https://www.keshah.com/app/claim?ft=<token>&uid=<uid>
 *      Universal Link matched by /.well-known/apple-app-site-association
 *      (iOS) + /.well-known/assetlinks.json (Android). If UL fails (Meta /
 *      TikTok in-app browser strips params during App Store hop), the /app/claim
 *      route.ts server handler is the fallback — it stores the token in a
 *      signed HttpOnly cookie so the app can pull it after fresh install.
 *
 * Race handling: Stripe usually redirects the browser here before the webhook
 * fires. If PendingClaims/<sessionId> hasn't materialized yet we render a
 * "Setting up your account…" state with client-side polling; once it lands we
 * swap in the CTA. We cap the poll at ~30 attempts (60s) then show a support
 * message.
 */

import { headers as nextHeaders } from "next/headers";
import Link from "next/link";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import SuccessClient from "./SuccessClient";

// Prevent Next from caching this — the PendingClaims doc is written by an
// out-of-band webhook and can change moment-to-moment.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PendingClaim {
  ft?: string; // Firebase custom token (short-TTL) — normalized on read
  uid?: string;
  email?: string;
  plan?: string;
  ready?: boolean;
}

// Firestore doc shape written by /api/stripe/trial-subscription/webhook —
// see grantRcEntitlement + PendingClaims write. Field name is
// `custom_token` on disk; we normalize to `ft` here so the client stays
// simple. Both readers tolerated for backwards compat during migrations.
interface PendingClaimDoc {
  custom_token?: string;
  ft?: string;
  uid?: string;
  email?: string;
  plan?: string;
}

async function readPendingClaim(
  sessionId: string,
): Promise<PendingClaim | null> {
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("PendingClaims").doc(sessionId).get();
    if (!snap.exists) return null;
    const data = snap.data() as PendingClaimDoc | undefined;
    const ft = data?.custom_token ?? data?.ft;
    if (!ft || !data?.uid) return null;
    return { ft, uid: data.uid, email: data.email, plan: data.plan };
  } catch (err) {
    console.error("[start/success] readPendingClaim failed:", err);
    return null;
  }
}

interface SuccessPageProps {
  searchParams: Promise<{
    session?: string | string[];
    session_id?: string | string[]; // Stripe Checkout redirect param name
  }>;
}

export default async function SuccessPage({ searchParams }: SuccessPageProps) {
  // Touch headers() so Next always renders this dynamically per request.
  await nextHeaders();
  const params = await searchParams;
  // Accept either ?session_id= (Stripe Checkout redirect) or ?session=
  // (legacy). Prefer Stripe's canonical name.
  const rawSession = params.session_id ?? params.session;
  const sessionId = Array.isArray(rawSession) ? rawSession[0] : rawSession;

  if (!sessionId) {
    return <MissingSessionState />;
  }

  const claim = await readPendingClaim(sessionId);

  return (
    <SuccessClient
      sessionId={sessionId}
      initialClaim={
        claim
          ? { ft: claim.ft!, uid: claim.uid!, email: claim.email, plan: claim.plan }
          : null
      }
    />
  );
}

function MissingSessionState() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Poppins, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <div style={{ maxWidth: 440, textAlign: "center" }}>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 700,
            letterSpacing: -0.5,
            margin: 0,
            marginBottom: 12,
          }}
        >
          We couldn&apos;t find your checkout session
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.7)",
            fontSize: 15,
            lineHeight: 1.5,
            marginBottom: 24,
          }}
        >
          If you just paid, check your email for the receipt and app-install
          link. Otherwise start over.
        </p>
        <Link
          href="/start"
          style={{
            display: "inline-block",
            padding: "14px 22px",
            background: "#fff",
            color: "#000",
            textDecoration: "none",
            borderRadius: 40,
            fontWeight: 600,
          }}
        >
          Back to start
        </Link>
      </div>
    </main>
  );
}
