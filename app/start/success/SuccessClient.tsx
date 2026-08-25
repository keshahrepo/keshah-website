"use client";

/**
 * SuccessClient — client half of /start/success.
 *
 * Renders one of two states:
 *   - Ready:   big "Open KESHAH app" CTA that deep-links to the universal
 *              link (/app/claim?ft=…&uid=…). Store badges as a hard fallback.
 *   - Pending: "Setting up your account…" while the Stripe webhook races the
 *              browser redirect. We call router.refresh() every 2s (up to 30
 *              attempts) to re-invoke the server component so it re-reads
 *              PendingClaims/<sessionId>. Once initialClaim comes back non-null
 *              on a refresh, this component re-renders with the CTA.
 *
 * The custom token is only ever used inside the universal-link href — it
 * doesn't get logged, echoed to the DOM outside the CTA anchor, or stored in
 * localStorage. Kept off analytics events on purpose.
 */

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6450676544";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

const UNIVERSAL_LINK_BASE = "https://www.keshah.com/app/claim";
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // ~60s total

interface Claim {
  ft: string;
  uid: string;
  email?: string;
  plan?: string;
}

interface SuccessClientProps {
  sessionId: string;
  initialClaim: Claim | null;
}

export default function SuccessClient({
  sessionId,
  initialClaim,
}: SuccessClientProps) {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);
  const attemptsRef = useRef(0);

  useEffect(() => {
    if (initialClaim) return; // already ready — no polling needed
    if (attemptsRef.current >= MAX_POLL_ATTEMPTS) return;

    const timer = setTimeout(() => {
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      // Re-invoke the server component so it re-reads PendingClaims.
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearTimeout(timer);
  }, [initialClaim, attempts, router]);

  if (!initialClaim) {
    return (
      <PendingState
        exhausted={attemptsRef.current >= MAX_POLL_ATTEMPTS}
        sessionId={sessionId}
      />
    );
  }

  const url = new URL(UNIVERSAL_LINK_BASE);
  url.searchParams.set("ft", initialClaim.ft);
  url.searchParams.set("uid", initialClaim.uid);
  const universalLinkHref = url.toString();

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#000",
        color: "#fff",
        padding: "48px 24px",
        fontFamily:
          "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        <Checkmark />
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: -0.6,
            lineHeight: 1.15,
            margin: "20px 0 12px",
          }}
        >
          You&apos;re in.
        </h1>
        <p
          style={{
            color: "rgba(255,255,255,0.75)",
            fontSize: 16,
            lineHeight: 1.5,
            margin: "0 0 32px",
          }}
        >
          Your KESHAH plan is ready. Open the app on your phone to start your
          daily scalp routine.
        </p>

        <a
          href={universalLinkHref}
          style={{
            display: "block",
            width: "100%",
            padding: "18px 22px",
            background: "#fff",
            color: "#000",
            textDecoration: "none",
            borderRadius: 40,
            fontWeight: 600,
            fontSize: 17,
            boxSizing: "border-box",
          }}
        >
          Open KESHAH app
        </a>

        <p
          style={{
            marginTop: 28,
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          or install the app on iOS / Android
        </p>

        <div
          style={{
            marginTop: 14,
            display: "flex",
            flexDirection: "row",
            gap: 12,
            justifyContent: "center",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <a
            href={APP_STORE_URL}
            style={{ display: "inline-block" }}
            aria-label="Download on the App Store"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/app-store-white.svg"
              alt="Download on the App Store"
              style={{ height: 44 }}
            />
          </a>
          <a
            href={PLAY_STORE_URL}
            style={{ display: "inline-block" }}
            aria-label="Get it on Google Play"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/images/google-play.svg"
              alt="Get it on Google Play"
              style={{ height: 44 }}
            />
          </a>
        </div>

        {initialClaim.email ? (
          <p
            style={{
              marginTop: 32,
              fontSize: 12,
              color: "rgba(255,255,255,0.35)",
            }}
          >
            Receipt sent to {initialClaim.email}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function PendingState({
  exhausted,
  sessionId,
}: {
  exhausted: boolean;
  sessionId: string;
}) {
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
        fontFamily:
          "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      }}
    >
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        {!exhausted ? (
          <>
            <Spinner />
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: -0.4,
                margin: "20px 0 8px",
              }}
            >
              Setting up your account…
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              This usually takes a few seconds. Don&apos;t close this page.
            </p>
          </>
        ) : (
          <>
            <h1
              style={{
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: -0.4,
                margin: "0 0 12px",
              }}
            >
              Still working on it
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,0.7)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: "0 0 20px",
              }}
            >
              Payment received. If this screen stays here for more than a
              minute, email <a
                href={`mailto:hello@keshah.com?subject=Post-checkout%20setup%20stuck&body=Session%20ID%3A%20${encodeURIComponent(sessionId)}`}
                style={{ color: "#fff", textDecoration: "underline" }}
              >hello@keshah.com</a> — we&apos;ll finish it manually and get you
              in.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

function Checkmark() {
  return (
    <div
      style={{
        display: "inline-flex",
        width: 64,
        height: 64,
        borderRadius: 32,
        background: "rgba(76,175,80,0.15)",
        alignItems: "center",
        justifyContent: "center",
      }}
      aria-hidden="true"
    >
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path
          d="M5 12l4.5 4.5L19 7"
          stroke="#4CAF50"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{
        animation: "keshah-spin 700ms linear infinite",
        display: "inline-block",
      }}
    >
      <style>{`@keyframes keshah-spin { to { transform: rotate(360deg); } }`}</style>
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="#fff"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="#fff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
