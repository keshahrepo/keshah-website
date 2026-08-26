"use client";

/**
 * SuccessClient — post-Stripe-checkout landing page.
 *
 * Two-step flow after payment succeeds:
 *   1. Sign-in step — "Almost there. Sign in to open KESHAH on your phone."
 *      typography ported from MomentFounderFlashback ("One last thing…").
 *      Three provider buttons (Google/Apple/Email); Google + Apple use
 *      signInWithRedirect (popups die in iOS Safari + IG/TikTok in-app
 *      browsers). The Firebase UID captured here is the SAME UID the
 *      mobile app will produce when the user signs in with the same
 *      provider, so RevenueCat entitlements follow the user into the app.
 *   2. Install step — same voice as sign-in ("You're in. Now download
 *      KESHAH to start your first session.") + App Store / Play Store CTAs.
 *
 * The webhook wrote PaidWebSessions/<sessionId>. We poll for it (~60s cap)
 * to handle the race where the browser redirects here before the webhook
 * fires. Once present, we render the sign-in step. After sign-in completes,
 * POST /api/attach-identity attaches the Firebase UID to the RC subscription
 * and seeds the Firestore User doc, then we show the install step.
 */

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  signInWithAppleNative,
  signInWithGoogleNative,
  initAppleSignIn,
  completeRedirectSignIn,
  signUpWithEmail,
  signInWithEmail,
  getIdToken,
  type SignInResult,
} from "@/app/start/lib/firebase-client";
import { fbqTrack } from "@/app/start/lib/fb-pixel";

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6450676544";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // ~60s total

interface PaidSession {
  email?: string | null;
  plan?: string | null;
  claimed_by_uid?: string | null;
  subscription_id?: string | null;
}

interface SuccessClientProps {
  sessionId: string;
  initialSession: PaidSession | null;
}

type Stage = "signIn" | "attaching" | "install";

export default function SuccessClient({
  sessionId,
  initialSession,
}: SuccessClientProps) {
  const router = useRouter();
  const attemptsRef = useRef(0);
  const [attempts, setAttempts] = useState(0);
  const [stage, setStage] = useState<Stage>("signIn");
  const [attachError, setAttachError] = useState<string | null>(null);
  const [signedInEmail, setSignedInEmail] = useState<string | null>(null);
  const redirectHandledRef = useRef(false);

  // Poll until the webhook writes PaidWebSessions/<sessionId>. Once
  // initialSession is non-null this effect no-ops.
  useEffect(() => {
    if (initialSession) return;
    if (attemptsRef.current >= MAX_POLL_ATTEMPTS) return;
    const timer = setTimeout(() => {
      attemptsRef.current += 1;
      setAttempts(attemptsRef.current);
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [initialSession, attempts, router]);

  // If the webhook already claimed this session (e.g. user signed in on a
  // different device), skip straight to install.
  useEffect(() => {
    if (initialSession?.claimed_by_uid) {
      setStage("install");
    }
  }, [initialSession]);

  // Fire browser-side StartTrial the moment we know a Stripe subscription
  // exists — regardless of whether the user has signed in yet. The trial
  // is REAL at this point (Stripe created the sub), and if they close the
  // tab before signing in we still want Meta to have the browser event.
  // event_id = Stripe subscription id, matches what our webhook sends to
  // CAPI → Meta dedupes → one conversion counted with best-of-both match
  // quality. Guarded by ref so a session-poll re-render doesn't fire twice.
  const startTrialFiredRef = useRef(false);
  useEffect(() => {
    if (startTrialFiredRef.current) return;
    const subId = initialSession?.subscription_id;
    if (!subId) return;
    startTrialFiredRef.current = true;
    fbqTrack("StartTrial", { value: 99, currency: "USD" }, subId);
  }, [initialSession]);

  const handleSignedIn = useCallback(
    async (result: SignInResult) => {
      setStage("attaching");
      setAttachError(null);
      // Update the overlay from "Opening Apple…" → "Setting up your
      // account…" so users know the ~2-5s server round-trip is expected
      // (not a hung sign-in).
      updateSignInOverlay("Setting up your account…");
      try {
        const idToken = await getIdToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (idToken) headers.Authorization = `Bearer ${idToken}`;
        // Pass the funnel session ID so the server can backfill
        // FunnelEvents timestamps (landingHook / founderStory / pinchTest
        // / resultScreenshots / trialPaywall) onto the Users doc — that
        // makes the mobile-style funnel drop-off panel work for web users.
        // Read sessionStorage first, fall back to the 7-day cookie
        // flow-context also writes (Stripe Checkout redirect can drop
        // sessionStorage in some browsers).
        const readCookie = (name: string): string | null => {
          if (typeof document === "undefined") return null;
          const m = document.cookie.match(
            new RegExp("(?:^|; )" + name + "=([^;]*)"),
          );
          return m ? m[1] : null;
        };
        const funnelSessionId =
          typeof window !== "undefined"
            ? sessionStorage.getItem("keshah_funnel_session") ??
              readCookie("keshah_funnel_session")
            : null;
        const res = await fetch("/api/attach-identity", {
          method: "POST",
          headers,
          body: JSON.stringify({
            session_id: sessionId,
            firebase_uid: result.uid,
            email: result.email,
            display_name: result.displayName,
            provider_id: result.providerId,
            funnel_session_id: funnelSessionId,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`attach-identity ${res.status}: ${text}`);
        }
        // Browser-side StartTrial already fired on the sign-in mount
        // (see useEffect above with startTrialFiredRef). No re-fire here.
        setSignedInEmail(result.email ?? null);
        setStage("install");
      } catch (err) {
        console.error("[SuccessClient] attach-identity failed:", err);
        setAttachError(
          "We couldn't link your account. Please try signing in again — your subscription is safe.",
        );
        setStage("signIn");
      } finally {
        hideSignInOverlay();
      }
    },
    [sessionId],
  );

  // Init the Apple SDK as soon as it's loaded. Must happen BEFORE the user
  // taps Continue with Apple so that AppleID.auth.signIn() can run
  // synchronously inside the click handler — otherwise mobile Safari
  // drops the user-gesture flag and blocks the popup.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.AppleID) {
      initAppleSignIn();
      return;
    }
    const interval = window.setInterval(() => {
      if (window.AppleID) {
        initAppleSignIn();
        window.clearInterval(interval);
      }
    }, 100);
    return () => window.clearInterval(interval);
  }, []);

  // Pick up the redirect result from signInWithRedirect. Fires once on
  // mount after the user returns from Apple/Google. Guarded by ref so it
  // never re-runs (React StrictMode + PaidWebSession polling both cause
  // re-renders — we don't want a second attach-identity POST).
  useEffect(() => {
    if (redirectHandledRef.current) return;
    if (!initialSession) return; // wait for webhook first
    redirectHandledRef.current = true;
    (async () => {
      try {
        const result = await completeRedirectSignIn();
        if (result) {
          setStage("attaching");
          await handleSignedIn(result);
        }
      } catch (err) {
        console.error("[SuccessClient] redirect result failed:", err);
        setAttachError(
          "Sign-in didn't complete. Please try again — your subscription is safe.",
        );
      }
    })();
  }, [initialSession, handleSignedIn]);

  if (!initialSession) {
    return (
      <PendingState
        exhausted={attemptsRef.current >= MAX_POLL_ATTEMPTS}
        sessionId={sessionId}
      />
    );
  }

  if (stage === "install") {
    return <InstallStep email={signedInEmail ?? initialSession.email ?? null} />;
  }

  return (
    <SignInStep
      email={initialSession.email ?? null}
      busy={stage === "attaching"}
      error={attachError}
      onSignedIn={handleSignedIn}
    />
  );
}

// ─── Sign-in step ───────────────────────────────────────────────────────────
// Copy-driven layout — mirrors MomentFounderFlashback voice + typography:
//   - "Almost there. Sign in to open KESHAH on your phone." — Poppins
//     28px/600, letter-spacing -1.0, line-height 1.32, left-aligned
//   - Continue with Google (white filled)
//   - Continue with Apple (white filled)
//   - Continue with email (white outlined)
//   - Black background

function SignInStep({
  email,
  busy,
  error,
  onSignedIn,
}: {
  email: string | null;
  busy: boolean;
  error: string | null;
  onSignedIn: (result: SignInResult) => void;
}) {
  const [showEmail, setShowEmail] = useState(false);
  const [providerBusy, setProviderBusy] = useState<
    "google" | "apple" | "email" | null
  >(null);

  const disabled = busy || providerBusy !== null;

  // Native SDK flow — Apple / Google's own JS renders the provider's
  // sign-in sheet directly on our keshah.com page. No Firebase OAuth
  // handler URL flashing, no "CONTINUE TO THE APP" fallback button.
  // On iOS Safari the OS-level Apple sheet appears at the bottom.
  // Show overlay on pointerdown (before click) so it paints in the gap
  // between finger-down and finger-up. If we wait for onClick, Safari
  // blocks the main thread opening the OAuth popup before any paint
  // happens and the overlay never appears until AFTER the popup is up.
  const preShow = (key: "google" | "apple") => () => {
    if (disabled) return;
    showSignInOverlay(key === "apple" ? "Apple" : "Google");
  };

  const startNative = (
    key: "google" | "apple",
    fn: () => Promise<SignInResult>,
  ) => async () => {
    if (disabled) return;
    // Overlay was already shown by preShow on pointerdown; just make sure
    // it's up in case the pointerdown handler was skipped (e.g. keyboard
    // activation).
    showSignInOverlay(key === "apple" ? "Apple" : "Google");
    flushSync(() => setProviderBusy(key));
    try {
      const result = await fn();
      // Native SDK completed synchronously — pass through to attach-identity
      // like the email flow does.
      onSignedIn(result);
    } catch (err) {
      console.error(`[SuccessClient] ${key} native sign-in failed:`, err);
      const rawErr = err as {
        message?: string;
        error?: string;
        code?: string;
      };
      const msg = rawErr?.message ?? rawErr?.error ?? "";
      // User closed the Apple sheet / Google prompt — silent.
      if (
        msg.includes("popup_closed") ||
        msg.includes("cancelled") ||
        msg.includes("user_cancelled") ||
        msg.includes("suppressed") ||
        rawErr?.error === "popup_closed_by_user" ||
        rawErr?.error === "user_cancelled_authorize"
      ) {
        hideSignInOverlay();
        setProviderBusy(null);
        return;
      }
      // TEMPORARY: surface the real error so we can debug from a phone
      // where the JS console isn't easily accessible.
      const debug = JSON.stringify(rawErr, Object.getOwnPropertyNames(rawErr));
      hideSignInOverlay();
      alert(
        `[${key}] sign-in error: ${msg || "(no message)"}\n\nfull: ${debug.slice(0, 500)}`,
      );
      setProviderBusy(null);
    }
  };

  return (
    <main style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <h1 style={headlineStyle}>
          Almost there. Sign in to open KESHAH on your phone.
        </h1>

        <div style={{ height: 40 }} />

        {error ? (
          <div
            style={{
              background: "rgba(220,53,69,0.1)",
              border: "1px solid rgba(220,53,69,0.3)",
              borderRadius: 8,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 13,
              color: "#ff6b6b",
              textAlign: "left",
            }}
          >
            {error}
          </div>
        ) : null}

        {!showEmail ? (
          <>
            <ProviderButton
              label="Continue with Google"
              filled
              icon={<GoogleIcon />}
              busy={providerBusy === "google"}
              disabled={disabled}
              onPointerDown={preShow("google")}
              onClick={startNative("google", signInWithGoogleNative)}
            />
            <div style={{ height: 12 }} />
            <ProviderButton
              label="Continue with Apple"
              filled
              icon={<AppleIcon />}
              busy={providerBusy === "apple"}
              disabled={disabled}
              onPointerDown={preShow("apple")}
              onClick={startNative("apple", signInWithAppleNative)}
            />
            <div style={{ height: 12 }} />
            <ProviderButton
              label="Continue with email"
              filled={false}
              busy={false}
              disabled={disabled}
              onClick={() => setShowEmail(true)}
            />
          </>
        ) : (
          <EmailForm
            defaultEmail={email ?? undefined}
            busy={providerBusy === "email" || busy}
            disabled={disabled}
            onBack={() => setShowEmail(false)}
            onSubmit={async (emailInput, password) => {
              if (disabled) return;
              setProviderBusy("email");
              try {
                let result: SignInResult;
                try {
                  result = await signUpWithEmail(emailInput, password);
                } catch (err) {
                  const code = (err as { code?: string })?.code;
                  if (code === "auth/email-already-in-use") {
                    result = await signInWithEmail(emailInput, password);
                  } else {
                    throw err;
                  }
                }
                onSignedIn(result);
              } catch (err) {
                console.error("[SuccessClient] email sign-in failed:", err);
                const code = (err as { code?: string })?.code;
                const msg =
                  code === "auth/wrong-password"
                    ? "That password doesn't match — try a different email or reset."
                    : code === "auth/weak-password"
                      ? "Password must be at least 6 characters."
                      : "Sign-in failed. Try another method.";
                alert(msg);
                setProviderBusy(null);
              }
            }}
          />
        )}
      </div>
    </main>
  );
}

function ProviderButton({
  label,
  filled,
  icon,
  busy,
  disabled,
  onClick,
  onPointerDown,
}: {
  label: string;
  filled: boolean;
  icon?: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
  onPointerDown?: () => void;
}) {
  const bg = filled ? "#fff" : "transparent";
  const color = filled ? "#000" : "#fff";
  const border = filled ? "none" : "1.5px solid rgba(255,255,255,0.5)";
  return (
    <>
      {/* CSS :active fires INSTANTLY on tap in the browser event loop —
          way before React can re-render for the busy state. Ensures the
          button visually depresses the moment the user taps, even when
          Safari is about to block the main thread for the OAuth popup. */}
      <style>{`
        .keshah-provider-btn {
          -webkit-tap-highlight-color: transparent;
          touch-action: manipulation;
          transition: opacity 150ms, transform 100ms;
        }
        .keshah-provider-btn:active:not(:disabled) {
          opacity: 0.55 !important;
          transform: scale(0.97);
        }
      `}</style>
      <button
        type="button"
        onClick={onClick}
        onPointerDown={onPointerDown}
        disabled={disabled}
        className="keshah-provider-btn"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
          width: "100%",
          padding: "16px 22px",
          background: bg,
          color,
          border,
          borderRadius: 40,
          fontWeight: 600,
          fontSize: 16,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: busy ? 0.55 : disabled ? 0.75 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy ? <Spinner size={16} color={color} /> : icon}
        {label}
      </button>
    </>
  );
}

function EmailForm({
  defaultEmail,
  busy,
  disabled,
  onBack,
  onSubmit,
}: {
  defaultEmail?: string;
  busy: boolean;
  disabled: boolean;
  onBack: () => void;
  onSubmit: (email: string, password: string) => Promise<void>;
}) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [password, setPassword] = useState("");
  const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "14px 16px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.15)",
    borderRadius: 12,
    color: "#fff",
    fontSize: 16,
    marginBottom: 10,
    boxSizing: "border-box",
    fontFamily: "inherit",
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void onSubmit(email.trim(), password);
      }}
      style={{ textAlign: "left" }}
    >
      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        autoComplete="email"
        style={inputStyle}
        disabled={disabled}
      />
      <input
        type="password"
        placeholder="Create a password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
        style={inputStyle}
        disabled={disabled}
      />
      <button
        type="submit"
        disabled={disabled || !email || password.length < 6}
        style={{
          width: "100%",
          padding: "16px 22px",
          background: "#fff",
          color: "#000",
          border: "none",
          borderRadius: 40,
          fontWeight: 600,
          fontSize: 16,
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: busy ? 0.55 : 1,
          fontFamily: "inherit",
        }}
      >
        {busy ? "Signing in…" : "Continue"}
      </button>
      <button
        type="button"
        onClick={onBack}
        disabled={disabled}
        style={{
          width: "100%",
          marginTop: 12,
          padding: 8,
          background: "transparent",
          color: "rgba(255,255,255,0.6)",
          border: "none",
          fontSize: 13,
          cursor: "pointer",
          textDecoration: "underline",
          fontFamily: "inherit",
        }}
      >
        Back to other options
      </button>
    </form>
  );
}

// ─── Install step ───────────────────────────────────────────────────────────

function InstallStep({ email: _email }: { email: string | null }) {
  return (
    <main style={pageStyle}>
      <div style={{ width: "100%", maxWidth: 560 }}>
        <h1 style={headlineStyle}>
          You&apos;re in. Now download KESHAH to start your first session.
        </h1>

        <div style={{ height: 40 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            gap: 12,
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
              style={{ height: 48 }}
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
              style={{ height: 48 }}
            />
          </a>
        </div>
      </div>
    </main>
  );
}

// ─── Pending state (waiting for webhook) ────────────────────────────────────

function PendingState({
  exhausted,
  sessionId,
}: {
  exhausted: boolean;
  sessionId: string;
}) {
  return (
    <main style={{ ...pageStyle, alignItems: "center", justifyContent: "center" }}>
      <div style={{ maxWidth: 440, width: "100%", textAlign: "center" }}>
        {!exhausted ? (
          <>
            <Spinner size={28} color="#fff" />
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: -0.4,
                margin: "20px 0 8px",
                color: "#fff",
              }}
            >
              Confirming your payment…
            </h1>
            <p
              style={{
                color: "rgba(255,255,255,0.6)",
                fontSize: 14,
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              This takes a few seconds. Don&apos;t close this page.
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
                color: "#fff",
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
              Payment received. If this screen stays for more than a minute,
              email{" "}
              <a
                href={`mailto:hello@keshah.com?subject=Post-checkout%20setup%20stuck&body=Session%20ID%3A%20${encodeURIComponent(
                  sessionId,
                )}`}
                style={{ color: "#fff", textDecoration: "underline" }}
              >
                hello@keshah.com
              </a>{" "}
              — we&apos;ll finish it manually and get you in.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#000",
  color: "#fff",
  padding: "48px 32px",
  fontFamily:
    "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  display: "flex",
  flexDirection: "column",
  alignItems: "flex-start",
  justifyContent: "center",
};

// Mirrors MomentFounderFlashback ("One last thing…") typography exactly.
// Every headline on /start/success uses this so the sign-in + install
// screens feel like a continuation of the pre-paywall voice.
const headlineStyle: React.CSSProperties = {
  fontFamily:
    "Poppins, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 28,
  fontWeight: 600,
  color: "#fff",
  letterSpacing: -1.0,
  lineHeight: 1.32,
  margin: 0,
  textAlign: "left",
};

function Spinner({ size = 20, color = "#000" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
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
        stroke={color}
        strokeOpacity="0.25"
        strokeWidth="3"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.492 2.27-1.184 3.07-.766.9-2.023 1.6-3.045 1.52-.121-1.12.416-2.29 1.11-3.06.79-.88 2.135-1.53 3.12-1.53zM20.5 17.05c-.554 1.276-.816 1.845-1.53 2.976-.998 1.577-2.404 3.542-4.144 3.556-1.548.014-1.946-1.007-4.046-.995-2.099.011-2.539 1.014-4.089.999-1.74-.014-3.072-1.79-4.07-3.366-2.79-4.415-3.083-9.6-1.362-12.351 1.223-1.954 3.153-3.098 4.966-3.098 1.847 0 3.008 1.012 4.535 1.012 1.482 0 2.385-1.014 4.522-1.014 1.614 0 3.325.88 4.542 2.402-3.995 2.19-3.346 7.87-1.324 9.879z" />
    </svg>
  );
}

// ─── Sign-in loading overlay (vanilla DOM, not React) ───────────────────────
// React re-renders queue behind Safari's main-thread block when the OAuth
// popup opens. Direct DOM inserts paint on the next browser event before
// the popup blocks. This is the ONLY reliable way to give the user
// instant feedback between tap and popup appearing.

const OVERLAY_ID = "keshah-signin-overlay";

function showSignInOverlay(providerLabel: string): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(OVERLAY_ID)) return; // already showing
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.style.cssText = [
    "position: fixed",
    "inset: 0",
    "z-index: 999999",
    "background: rgba(0, 0, 0, 0.72)",
    "backdrop-filter: blur(6px)",
    "-webkit-backdrop-filter: blur(6px)",
    "display: flex",
    "flex-direction: column",
    "align-items: center",
    "justify-content: center",
    "gap: 20px",
    "color: #fff",
    "font-family: Poppins, -apple-system, BlinkMacSystemFont, sans-serif",
    "font-size: 16px",
    "opacity: 0",
    "transition: opacity 120ms ease-out",
    "pointer-events: none",
  ].join("; ");
  overlay.innerHTML = `
    <div style="font-size:18px;font-weight:500;letter-spacing:-0.3px;">Opening ${providerLabel}…</div>
  `;
  document.body.appendChild(overlay);
  // Force reflow so the browser commits the initial opacity: 0 before
  // we transition to 1 — otherwise it snaps in with no fade.
  void overlay.offsetHeight;
  overlay.style.opacity = "1";
}

function hideSignInOverlay(): void {
  if (typeof document === "undefined") return;
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.style.opacity = "0";
  window.setTimeout(() => overlay.remove(), 200);
}

/** Change the copy inside the existing overlay without dismount/remount.
 * Used when we transition from "Opening Apple…" (popup phase) to
 * "Setting up your account…" (attach-identity POST phase). */
function updateSignInOverlay(text: string): void {
  if (typeof document === "undefined") return;
  const overlay = document.getElementById(OVERLAY_ID);
  if (!overlay) return;
  overlay.innerHTML = `
    <div style="font-size:18px;font-weight:500;letter-spacing:-0.3px;">${text}</div>
  `;
}
