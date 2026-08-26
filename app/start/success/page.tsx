/**
 * /start/success — post-Stripe-checkout landing page.
 *
 * Flow (post identity-defer refactor):
 *   1. Stripe redirects here with ?session_id=<checkout_session_id> once
 *      payment succeeds.
 *   2. The trial-subscription webhook writes PaidWebSessions/<sessionId>
 *      with email + metadata. No Firebase user or Firestore User doc is
 *      created here — identity is captured post-sign-in.
 *   3. This page reads PaidWebSessions/<sessionId> server-side and renders
 *      the sign-in step (SuccessClient). If the doc hasn't materialized
 *      yet, SuccessClient polls until it does.
 *   4. User signs in with Apple/Google/email → SuccessClient POSTs
 *      /api/attach-identity → Firebase UID attached to RC subscription
 *      + Firestore User doc seeded → install-app step shown.
 *   5. User installs mobile app, signs in with SAME provider, sees their
 *      entitlement immediately.
 */

import { headers as nextHeaders } from "next/headers";
import Link from "next/link";
import { getFirebaseAdmin } from "@/lib/firebase-admin";
import SuccessClient from "./SuccessClient";

// Prevent Next from caching this — the PaidWebSessions doc is written by
// an out-of-band webhook and can change moment-to-moment.
export const dynamic = "force-dynamic";
export const revalidate = 0;

interface PaidSession {
  email?: string | null;
  plan?: string | null;
  claimed_by_uid?: string | null;
  // Stripe subscription ID — passed to SuccessClient so it can fire the
  // browser-side StartTrial pixel on page mount with the SAME event_id
  // our server-side CAPI uses. Meta dedupes on event_id.
  subscription_id?: string | null;
}

interface PaidSessionDoc {
  email?: string | null;
  plan?: string | null;
  claimed_by_uid?: string | null;
  subscription_id?: string | null;
}

async function readPaidSession(
  sessionId: string,
): Promise<PaidSession | null> {
  try {
    const { db } = getFirebaseAdmin();
    const snap = await db.collection("PaidWebSessions").doc(sessionId).get();
    if (!snap.exists) return null;
    const data = snap.data() as PaidSessionDoc | undefined;
    return {
      email: data?.email ?? null,
      plan: data?.plan ?? null,
      claimed_by_uid: data?.claimed_by_uid ?? null,
      subscription_id: data?.subscription_id ?? null,
    };
  } catch (err) {
    console.error("[start/success] readPaidSession failed:", err);
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
  const rawSession = params.session_id ?? params.session;
  const sessionId = Array.isArray(rawSession) ? rawSession[0] : rawSession;

  if (!sessionId) {
    return <MissingSessionState />;
  }

  const initialSession = await readPaidSession(sessionId);

  return (
    <SuccessClient sessionId={sessionId} initialSession={initialSession} />
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
          If you just paid, check your email for the receipt. Otherwise start
          over.
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
