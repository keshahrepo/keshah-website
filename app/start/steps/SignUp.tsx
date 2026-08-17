"use client";

// Account creation gate between socialProof and treatmentReady.
// User has seen the quiz, the proof, and the social validation — this is
// the moment to sign up "to unlock your treatment plan." Purpose beyond
// UX: tie the RC purchase to a real Firebase UID from the start, so the
// mobile app sees the entitlement the moment the user signs in with the
// same provider (no redemption links, no custom URL schemes).
import { useState } from "react";
import { useFlow } from "../lib/flow-context";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import StepHeader from "../components/StepHeader";
import {
  signInWithGoogle,
  signUpWithEmail,
  type SignInResult,
} from "../lib/firebase-client";
import { aliasToUser } from "../lib/revenuecat";
import { ttqTrack, ttqIdentify } from "../lib/tiktok-pixel";
import styles from "./signup.module.css";

type Mode = "choice" | "email";

export default function SignUp() {
  const { next, updateAnswers, answers } = useFlow();
  const [mode, setMode] = useState<Mode>("choice");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Email mode state
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const isIndia =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startindia");
  // /startfree — US trial path. Tag the user so the trial-end reminder
  // email scheduled function can find them.
  const isStartFree =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startfree");

  // Affiliate attribution — the funnel is reused across multiple landing
  // paths (/start, /chad, etc). SignUp reads the path to tag the user's
  // Firestore doc with referral_source, which lets us measure which
  // affiliate drove the purchase.
  const referralSource =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/chad")
      ? "chad"
      : null;

  const applyResult = async (result: SignInResult, passwordForSync?: string) => {
    updateAnswers({
      firebaseUid: result.uid,
      email: result.email ?? undefined,
      providerId: result.providerId,
    });

    if (isIndia) {
      // India path: verify Razorpay payment + grant RC entitlement
      // server-side. Payment details were stored in localStorage by
      // IndiaPlanModal (or IndiaTrialPlanModal) after Razorpay succeeded.
      // If `trial: true`, route to /start-trial (grants 1-day RC promo +
      // marks trial_status=active). Otherwise /verify for full payment.
      try {
        const rzpRaw = localStorage.getItem("keshah_rzp_payment");
        if (!rzpRaw) throw new Error("No Razorpay payment found");
        const rzp = JSON.parse(rzpRaw);
        const endpoint = rzp.trial
          ? "/api/razorpay/start-trial"
          : "/api/razorpay/verify";
        const verifyRes = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_subscription_id: rzp.razorpay_subscription_id,
            razorpay_payment_id: rzp.razorpay_payment_id,
            razorpay_signature: rzp.razorpay_signature,
            firebaseUid: result.uid,
            plan: rzp.plan,
            ...(rzp.trial && rzp.trialDays ? { trialDays: rzp.trialDays } : {}),
          }),
        });
        const verifyData = await verifyRes.json();
        if (!verifyData.ok) {
          // eslint-disable-next-line no-console
          console.error("[signup] Razorpay verify response:", verifyData);
          throw new Error(verifyData.error || "Verification failed");
        }
        // Clean up — don't re-use stale payment data on future purchases
        try { localStorage.removeItem("keshah_rzp_payment"); } catch {}
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[signup] Razorpay verify failed:", err);
        setError(`Verification error: ${err instanceof Error ? err.message : String(err)}. Contact support with your email.`);
        setBusy(false);
        return;
      }
    } else {
      // US path: alias the anonymous RC customer to the Firebase UID.
      try {
        await aliasToUser(result.uid);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error("[signup] RC alias failed:", err);
        setError("We couldn't link your purchase. Contact support with your email.");
        setBusy(false);
        return;
      }
    }

    // Persist quiz answers + profile to Firestore keyed by UID. Awaited so
    // a failed write surfaces to the user instead of letting them advance
    // to purchaseSuccess with no Firestore doc (which silently breaks app
    // sign-in). The Stripe webhook is the server-side safety net for cases
    // where the user closes the browser, but THIS fetch is what links the
    // quiz answers to the Firebase UID — losing it silently is worse than
    // showing an error.
    try {
      const profileRes = await fetch("/api/funnel/save-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: result.uid,
          email: result.email,
          displayName: result.displayName,
          providerId: result.providerId,
          password: passwordForSync,
          quizAnswers: answers,
          referralSource,
          plan: answers.purchaseTier,
          paymentProvider: isIndia ? "razorpay" : "rc_billing",
          signupSource: isStartFree ? "startfree_us_trial" : undefined,
          trialDays: isStartFree ? 3 : undefined,
          // Browser timezone — server uses this to set userLocalTimeZone
          // (which the mobile app reads for tier-1 vs tier-2 classification)
          // and to compute start_date.date in the user's local day boundary.
          // Date.getTimezoneOffset returns minutes WEST of UTC; flip the sign
          // to get east-of-UTC, matching the mobile app's convention.
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          timezoneOffsetInMins: -new Date().getTimezoneOffset(),
        }),
        keepalive: true,
      });
      if (!profileRes.ok) {
        // eslint-disable-next-line no-console
        console.error("[signup] save-profile failed:", profileRes.status, await profileRes.text());
        setError("We couldn't save your profile. Contact support with your email.");
        setBusy(false);
        return;
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[signup] save-profile network error:", err);
      setError("Network issue saving your profile. Contact support with your email.");
      setBusy(false);
      return;
    }

    // TikTok pixel — fire after sign-up converges from any auth method.
    // identify() augments AAM with hashed email/uid for social-signin users
    // who never typed their email into a visible form input.
    void ttqIdentify({ email: result.email ?? undefined, externalId: result.uid });
    ttqTrack("CompleteRegistration", {
      contents: [{ content_id: "signup", content_type: "product", content_name: "KESHAH SignUp" }],
    });

    mediumHaptic();
    next();
  };

  const handleGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      await applyResult(result);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!email || !password || password.length < 8) {
      setError("Use a valid email and a password of at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await signUpWithEmail(email, password);
      // Pass the plaintext password so the server can write the AES-encrypted
      // form to Firestore — required for the mobile app's email login path.
      await applyResult(result, password);
    } catch (err) {
      setError(friendlyError(err));
      setBusy(false);
    }
  };

  return (
    <div className={styles.root}>
      <StepHeader />
      <div className={styles.body}>
        <div className={styles.content}>
          <h1 className={styles.headline}>
            You&apos;re in. Create your account.
          </h1>
          <p className={styles.description}>
            {mode === "choice"
              ? "Sign up so your purchase syncs to the KESHAH app. Use the same method to sign in on your phone."
              : "Create an account with email and password."}
          </p>

          {mode === "choice" ? (
            <>
              <button
                type="button"
                className={styles.googleBtn}
                onClick={handleGoogle}
                disabled={busy}
              >
                <GoogleLogo />
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                className={styles.emailBtn}
                onClick={() => {
                  lightHaptic();
                  setMode("email");
                  setError(null);
                }}
                disabled={busy}
              >
                Use email instead
              </button>
            </>
          ) : (
            <form onSubmit={handleEmailSubmit} className={styles.form}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={styles.input}
                disabled={busy}
                required
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                disabled={busy}
                required
                minLength={8}
              />
              <button type="submit" className={styles.submitBtn} disabled={busy}>
                {busy ? "…" : "Create account"}
              </button>

              <button
                type="button"
                className={styles.linkBtn}
                onClick={() => {
                  lightHaptic();
                  setMode("choice");
                  setError(null);
                }}
                disabled={busy}
              >
                Back to sign-up options
              </button>
            </form>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <p className={styles.footnote}>
            We&apos;ll use the same sign-in method in the KESHAH app so your
            plan syncs automatically.
          </p>
        </div>
      </div>
    </div>
  );
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/popup-closed-by-user|popup-blocked/i.test(msg)) {
    return "Sign-in cancelled. Try again.";
  }
  if (/email-already-in-use/i.test(msg)) {
    return "That email already has an account. Use a different email or contact support.";
  }
  if (/weak-password/i.test(msg)) {
    return "Password is too weak. Use at least 8 characters.";
  }
  if (/network-request-failed/i.test(msg)) {
    return "Network error. Check your connection and try again.";
  }
  return "Something went wrong. Try again.";
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path
        d="M17.64 9.2c0-.64-.06-1.25-.17-1.84H9v3.48h4.84c-.21 1.13-.84 2.08-1.79 2.72v2.26h2.9c1.7-1.56 2.69-3.87 2.69-6.62z"
        fill="#4285F4"
      />
      <path
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 0 0 9 18z"
        fill="#34A853"
      />
      <path
        d="M3.95 10.7c-.18-.54-.28-1.12-.28-1.7s.1-1.16.28-1.7V4.97H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
        fill="#FBBC05"
      />
      <path
        d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.97l2.99 2.33C4.66 5.17 6.65 3.58 9 3.58z"
        fill="#EA4335"
      />
    </svg>
  );
}
