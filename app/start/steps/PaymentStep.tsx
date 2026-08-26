"use client";

// Kicks off Stripe Checkout Session on mount. Backend creates a hosted
// checkout URL (checkout.stripe.com), we redirect the browser there.
// User pays on Stripe, gets bounced to /start/success?session_id=… which
// polls for the Firebase custom token minted by the webhook.
//
// Zero inline card fields — the whole payment surface is Stripe hosted.
// Trust signal: user sees checkout.stripe.com URL bar. Better than any
// inline Element for cold traffic per Aadi's read.

import { useEffect, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { colors } from "../lib/tokens";

const HEADER_STYLE = {
  fontFamily: "Poppins, -apple-system, sans-serif",
  fontSize: 22,
  fontWeight: 600 as const,
  color: colors.white,
  letterSpacing: "-0.6px",
  lineHeight: 1.3,
  margin: 0,
  textAlign: "center" as const,
};

const SUB_STYLE = {
  fontFamily: "Poppins, -apple-system, sans-serif",
  fontSize: 14,
  fontWeight: 400 as const,
  color: "rgba(255,255,255,0.65)",
  lineHeight: 1.5,
  margin: "12px 0 0",
  textAlign: "center" as const,
};

const RETRY_STYLE = {
  fontFamily: "Poppins, -apple-system, sans-serif",
  fontSize: 14,
  fontWeight: 500 as const,
  color: colors.white,
  background: "transparent",
  border: `1px solid rgba(255,255,255,0.35)`,
  borderRadius: 40,
  padding: "12px 20px",
  cursor: "pointer",
  marginTop: 20,
};

export default function PaymentStep() {
  const { answers } = useFlow();
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const kickedOff = useRef(false);

  useEffect(() => {
    // StrictMode double-invokes effects in dev. Guard so we only create
    // one Checkout Session per mount + retry.
    if (kickedOff.current) return;
    kickedOff.current = true;

    (async () => {
      try {
        // Capture browser timezone so the webhook writes start_date in
        // the user's actual timezone. Without this, the fallback kicks
        // in (America/New_York) which is fine for most US traffic but
        // wrong for anyone abroad. Intl.DateTimeFormat() is universally
        // supported in every mobile browser we care about.
        let timezone = "";
        let timezoneOffsetMins = 0;
        try {
          timezone =
            Intl.DateTimeFormat().resolvedOptions().timeZone || "";
          // getTimezoneOffset returns MINUTES WEST of UTC (positive
          // means behind UTC), which is the inverse of what Firestore
          // expects. Negate.
          timezoneOffsetMins = -new Date().getTimezoneOffset();
        } catch {
          // Old browsers without Intl.DateTimeFormat: fall back to
          // whatever the server picks.
        }

        // Extend with two fields the API expects but that aren't in the
        // strict QuizAnswers type. Cast the merged object so TS doesn't
        // complain about extra keys.
        const enriched: Record<string, unknown> = {
          ...answers,
          timezone,
          timezone_offset_mins: timezoneOffsetMins,
        };

        const res = await fetch("/api/stripe/create-subscription", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quizAnswers: enriched }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          url?: string;
          error?: string;
        };
        if (!res.ok || !data.ok || !data.url) {
          throw new Error(data.error ?? `checkout_create_${res.status}`);
        }
        // Redirect the browser to Stripe's hosted checkout.
        window.location.href = data.url;
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        kickedOff.current = false; // allow retry
      }
    })();
  }, [answers, attempt]);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 24px",
        color: colors.white,
        textAlign: "center",
      }}
    >
      {!error ? (
        <>
          <div
            aria-hidden
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: colors.white,
              animation: "keshah-spin 700ms linear infinite",
            }}
          />
          <style>{`@keyframes keshah-spin { to { transform: rotate(360deg); } }`}</style>
        </>
      ) : (
        <>
          <h1 style={HEADER_STYLE}>Something went wrong.</h1>
          <p style={SUB_STYLE}>{error}</p>
          <button
            type="button"
            onClick={() => {
              setError(null);
              setAttempt((a) => a + 1);
            }}
            style={RETRY_STYLE}
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
