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
import {
  redirectToApple,
  redirectToGoogle,
  completeRedirectSignIn,
  signUpWithEmail,
  signInWithEmail,
  getIdToken,
  type SignInResult,
} from "@/app/start/lib/firebase-client";

const APP_STORE_URL = "https://apps.apple.com/app/keshah/id6450676544";
const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 30; // ~60s total

interface PaidSession {
  email?: string | null;
  plan?: string | null;
  claimed_by_uid?: string | null;
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

  const handleSignedIn = useCallback(
    async (result: SignInResult) => {
      setStage("attaching");
      setAttachError(null);
      try {
        const idToken = await getIdToken();
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
        };
        if (idToken) headers.Authorization = `Bearer ${idToken}`;
        const res = await fetch("/api/attach-identity", {
          method: "POST",
          headers,
          body: JSON.stringify({
            session_id: sessionId,
            firebase_uid: result.uid,
            email: result.email,
            display_name: result.displayName,
            provider_id: result.providerId,
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          throw new Error(`attach-identity ${res.status}: ${text}`);
        }
        setSignedInEmail(result.email ?? null);
        setStage("install");
      } catch (err) {
        console.error("[SuccessClient] attach-identity failed:", err);
        setAttachError(
          "We couldn't link your account. Please try signing in again — your subscription is safe.",
        );
        setStage("signIn");
      }
    },
    [sessionId],
  );

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

  // Redirect flow — navigates the whole page to the provider. The user
  // returns to /start/success post-auth; SuccessClient's redirect-pickup
  // effect calls attach-identity from there. We don't set state after
  // calling redirectTo* — the browser navigates away before any
  // subsequent code runs.
  const startRedirect = (
    key: "google" | "apple",
    fn: () => Promise<void>,
  ) => async () => {
    if (disabled) return;
    setProviderBusy(key);
    try {
      await fn();
      // Unreachable — page navigates on success.
    } catch (err) {
      console.error(`[SuccessClient] ${key} redirect failed:`, err);
      alert(
        "Sign-in couldn't start. Please try another method — your subscription is safe.",
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
              onClick={startRedirect("google", redirectToGoogle)}
            />
            <div style={{ height: 12 }} />
            <ProviderButton
              label="Continue with Apple"
              filled
              icon={<AppleIcon />}
              busy={providerBusy === "apple"}
              disabled={disabled}
              onClick={startRedirect("apple", redirectToApple)}
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
}: {
  label: string;
  filled: boolean;
  icon?: React.ReactNode;
  busy: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const bg = filled ? "#fff" : "transparent";
  const color = filled ? "#000" : "#fff";
  const border = filled ? "none" : "1.5px solid rgba(255,255,255,0.5)";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
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
        transition: "opacity 200ms",
        fontFamily: "inherit",
      }}
    >
      {busy ? <Spinner size={16} color={color} /> : icon}
      {label}
    </button>
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
