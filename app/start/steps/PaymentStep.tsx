"use client";

/**
 * PaymentStep — Stripe deferred-payment step, slotted immediately after
 * TrialPaywall7DayStep. User has already committed to the 7-day free trial
 * on the paywall; this screen collects the card so the trial can start.
 *
 * Structure:
 *   - Header block mirrors the trial-paywall voice: "Add a card to start
 *     your 7 days." Free until day 7, cancel anytime, no charge today.
 *   - ExpressCheckoutElement on top (Apple Pay / Google Pay / Link) so
 *     mobile users can pay in one tap.
 *   - "or pay with card" separator, then a PaymentElement fallback with
 *     Link autofill enabled.
 *   - Sticky CTA "Start my 7-day trial" styled to match the trial-paywall
 *     button (white background, black text, 40-radius pill).
 *
 * Stripe integration — deferred-intent flow:
 *   1. On mount we lazy-load @stripe/stripe-js with the publishable key
 *      returned from the funnel-config-aware /api/config/stripe endpoint
 *      (falls back to NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY if that env is
 *      wired at build time).
 *   2. <Elements> is instantiated with `mode: 'subscription'`, monthly
 *      amount matching the trial paywall ($33/mo → 3300 cents), and
 *      `paymentMethodCreation: 'manual'` so we defer subscription
 *      creation until submit — no wasted PaymentIntent per abandon.
 *   3. On submit we call `elements.submit()` to validate + tokenize the
 *      card, then POST /api/stripe/trial-subscription/create with the
 *      full quiz-metadata payload the contract requires. The backend
 *      creates the Stripe customer, the subscription with
 *      trial_period_days: 7, seeds the FreeV2 Firestore user doc, and
 *      returns `{ ok, clientSecret, uid, sessionId, universalLink }`.
 *   4. We call `stripe.confirmPayment` with the returned clientSecret
 *      (redirect: 'if_required') so 3DS challenges still work for the
 *      cards that need them; trial subs with $0 due return succeeded
 *      instantly and we advance without a redirect.
 *   5. On success we hand the sessionId to the completion screen via
 *      `router.push('/start/success?session=<id>')`. That page owns the
 *      universal-link handoff (custom-token deep-link with ?ft=<token>).
 *
 * Failure modes are surfaced inline (red text under the payment element)
 * — we never blow the user out of the flow. Card decline / 3DS failure
 * keeps the user on this screen so they can retry with a different card.
 */

import { Elements, ExpressCheckoutElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { Stripe, StripeElementsOptions } from "@stripe/stripe-js";
import { loadStripe } from "@stripe/stripe-js";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { lightHaptic } from "../lib/haptics";
import { colors } from "../lib/tokens";

// Mirrors TrialPaywall7DayStep MONTHLY_EQUIV_DISPLAY — keep in sync when
// pricing changes. `SUBSCRIPTION_AMOUNT_CENTS` is only the amount hint we
// give <Elements /> for wallet-button rendering (Apple/Google Pay show
// the sheet total). The actual charge is set server-side from the Stripe
// price attached to the subscription.
const PLAN_PRICE_DISPLAY = "$99";
const MONTHLY_EQUIV_DISPLAY = "$33";
const SUBSCRIPTION_AMOUNT_CENTS = 9900; // 3-month billed as $99
const TRIAL_DAYS = 7;

const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];

// Element appearance — dark theme to match the rest of the funnel. We
// pass hex values instead of CSS variables because Stripe iframes can't
// read our page's custom properties.
const STRIPE_APPEARANCE = {
  theme: "night" as const,
  variables: {
    colorPrimary: "#FFFFFF",
    colorBackground: "#111111",
    colorText: "#FFFFFF",
    colorDanger: "#FF6B6B",
    fontFamily: 'Poppins, -apple-system, sans-serif',
    borderRadius: "10px",
    spacingUnit: "4px",
  },
  rules: {
    ".Input": {
      backgroundColor: "#1a1a1a",
      border: "1px solid rgba(255,255,255,0.12)",
      color: "#FFFFFF",
    },
    ".Input:focus": {
      border: "1px solid rgba(255,255,255,0.4)",
      boxShadow: "0 0 0 1px rgba(255,255,255,0.15)",
    },
    ".Label": {
      color: "rgba(255,255,255,0.7)",
      fontSize: "13px",
    },
    ".Tab": {
      backgroundColor: "#1a1a1a",
      border: "1px solid rgba(255,255,255,0.12)",
    },
    ".Tab--selected": {
      border: "1px solid #FFFFFF",
    },
  },
};

// Lazy singleton so we don't reinstantiate Stripe on every render. loadStripe
// resolves once per key and caches internally — this wrapper is belt-and-
// braces so a re-mounted step doesn't re-fetch stripe.js.
let stripePromiseCache: Promise<Stripe | null> | null = null;
function getStripePromise(publishableKey: string | null): Promise<Stripe | null> {
  if (!publishableKey) return Promise.resolve(null);
  if (!stripePromiseCache) {
    stripePromiseCache = loadStripe(publishableKey);
  }
  return stripePromiseCache;
}

export default function PaymentStep() {
  // Publishable key is safe to expose (that's the whole point). We read
  // it from NEXT_PUBLIC_* first; if not injected at build time we ping a
  // tiny config endpoint. Nothing else in the funnel needs it, so we do
  // the fetch here instead of a top-level provider.
  const [publishableKey, setPublishableKey] = useState<string | null>(
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
  );
  const [keyError, setKeyError] = useState<string | null>(null);

  useEffect(() => {
    if (publishableKey) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/config/stripe", { cache: "no-store" });
        if (!r.ok) throw new Error(`config_${r.status}`);
        const { publishableKey: k } = (await r.json()) as { publishableKey?: string };
        if (cancelled) return;
        if (!k) throw new Error("no_publishable_key");
        setPublishableKey(k);
      } catch (err) {
        if (cancelled) return;
        setKeyError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [publishableKey]);

  const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey]);

  const elementsOptions: StripeElementsOptions = useMemo(
    () => ({
      mode: "subscription",
      amount: SUBSCRIPTION_AMOUNT_CENTS,
      currency: "usd",
      // Defer PaymentIntent creation to server-side subscription create
      // — we don't create resources per-mount, only per-submit.
      paymentMethodCreation: "manual",
      appearance: STRIPE_APPEARANCE,
    }),
    [],
  );

  if (keyError) {
    return <FullScreenError message="Payment is temporarily unavailable. Please try again in a moment." />;
  }
  if (!publishableKey || !stripePromise) {
    return <FullScreenLoader />;
  }

  return (
    <Elements stripe={stripePromise} options={elementsOptions}>
      <PaymentForm />
    </Elements>
  );
}

function PaymentForm() {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const { answers } = useFlow();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Track whether the PaymentElement itself is ready — ExpressCheckout
  // renders faster than card fields, so we only lift the skeleton off
  // the card section when it's actually mounted.
  const [paymentElementReady, setPaymentElementReady] = useState(false);

  const handleConfirm = async () => {
    if (submitting) return;
    if (!stripe || !elements) return;

    lightHaptic();
    setSubmitting(true);
    setError(null);

    try {
      // 1. Validate + tokenize the card on the client. Elements throws
      //    if the user hasn't filled required fields yet — we treat
      //    that as a soft failure and let them fix it.
      const submitResult = await elements.submit();
      if (submitResult.error) {
        setError(submitResult.error.message ?? "Please check your card details.");
        setSubmitting(false);
        return;
      }

      // 2. Create the subscription server-side. Ship the full quiz
      //    payload the contract requires so the backend can seed the
      //    FreeV2 Firestore doc atomically with the Stripe subscription
      //    create call.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const tzOffsetMins = -new Date().getTimezoneOffset();
      const res = await fetch("/api/stripe/trial-subscription/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "web_trial_paywall_7day",
          plan_key: "monthlyTrial",
          trial_days: TRIAL_DAYS,
          quiz: {
            first_name: answers.firstName ?? null,
            phone_number: answers.phoneNumber ?? null,
            email: answers.email ?? null,
            gender: answers.gender ?? null,
            hair_goal: answers.hairGoal ?? null,
            hair_loss_location: answers.hairLossLocation ?? null,
            commitment_answer: answers.commitmentAnswer ?? null,
            support_needs: answers.supportNeeds ?? null,
            referral_source: answers.referralSource ?? null,
            age_range: answers.ageRange ?? null,
            hair_loss_medication: answers.hairLossMedication ?? null,
            hormonal_changes: answers.hormonalChanges ?? null,
            tight_hairstyles: answers.tightHairstyles ?? null,
            hardest_part: answers.hardestPart ?? null,
            family_history: answers.familyHistory ?? null,
            stress_contribution: answers.stressContribution ?? null,
            pinch_test_answer: answers.pinchTestAnswer ?? null,
          },
          timezone: tz,
          timezone_offset_mins: tzOffsetMins,
        }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        clientSecret?: string;
        uid?: string;
        sessionId?: string;
      };

      if (!res.ok || !payload.ok) {
        throw new Error(payload.error ?? `create_failed_${res.status}`);
      }

      const { clientSecret, uid, sessionId } = payload;
      if (!clientSecret || !sessionId) {
        throw new Error("missing_client_secret_or_session");
      }

      // 3. Confirm the intent. For a 7-day trial with $0 due today the
      //    intent typically comes back as `requires_confirmation` with
      //    zero-amount — confirmPayment resolves immediately and we skip
      //    the redirect. For real charges (e.g. immediate first payment
      //    if the backend disables the trial for this user) 3DS may
      //    trigger a redirect via return_url.
      const returnUrl = `${window.location.origin}/start/success?session=${encodeURIComponent(sessionId)}`;
      const { error: confirmErr } = await stripe.confirmPayment({
        elements,
        clientSecret,
        confirmParams: { return_url: returnUrl },
        redirect: "if_required",
      });

      if (confirmErr) {
        setError(confirmErr.message ?? "We couldn't charge that card. Please try another.");
        setSubmitting(false);
        return;
      }

      // 4. No redirect needed — advance to the completion screen. The
      //    success page reads sessionId → hits /api/handoff to mint the
      //    custom-token universal link and hands off to the app.
      if (uid) {
        // Non-load-bearing debug marker so Sentry breadcrumbs show which
        // uid the client saw; the token itself is never logged.
        // eslint-disable-next-line no-console
        console.debug("[payment] confirmed", { session: sessionId });
      }
      router.push(`/start/success?session=${encodeURIComponent(sessionId)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Something went wrong. Please try again.");
      setSubmitting(false);
    }
  };

  // ExpressCheckout confirm — Apple Pay / Google Pay / Link one-tap. The
  // element passes us a token; we submit the same subscription-create
  // request and confirm.
  const handleExpressConfirm = async () => {
    // The ExpressCheckoutElement's onConfirm callback is fired AFTER the
    // user picks a wallet + authenticates in the OS sheet. We reuse the
    // same submit path — elements.submit() picks up the wallet-supplied
    // payment method and confirmPayment finalizes.
    await handleConfirm();
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100%",
        flex: 1,
        background: colors.black,
        color: colors.white,
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "40px 24px 20px",
        }}
      >
        <div style={{ maxWidth: 480, marginLeft: "auto", marginRight: "auto" }}>
          {/* Header — matches TrialPaywall7DayStep tone */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.36, delay: 0.1, ease: EASE_OUT }}
          >
            <h1
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 26,
                fontWeight: 600,
                color: colors.white,
                letterSpacing: "-1.2px",
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              Add a card to start your 7 days.
            </h1>
            <div style={{ height: 10 }} />
            <p
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 14,
                fontWeight: 500,
                color: "rgba(255,255,255,0.75)",
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Free until day {TRIAL_DAYS}. Then {MONTHLY_EQUIV_DISPLAY}/month
              (billed as {PLAN_PRICE_DISPLAY} every 3 months). Cancel any time from the app.
            </p>
          </motion.div>

          <div style={{ height: 24 }} />

          {/* ExpressCheckout — one-tap wallets. Renders nothing if the
              browser/device doesn't support any of Apple Pay / Google Pay
              / Link, which is the correct fallback behavior. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.36, delay: 0.2, ease: EASE_OUT }}
          >
            <ExpressCheckoutElement
              onConfirm={handleExpressConfirm}
              options={{
                buttonHeight: 48,
                buttonTheme: { applePay: "white-outline", googlePay: "white", paypal: "gold" },
              }}
            />
          </motion.div>

          <div style={{ height: 20 }} />

          {/* Separator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.36, delay: 0.28, ease: EASE_OUT }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
            <span
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 11,
                fontWeight: 500,
                letterSpacing: "1.2px",
                color: "rgba(255,255,255,0.4)",
                textTransform: "uppercase",
              }}
            >
              or pay with card
            </span>
            <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.12)" }} />
          </motion.div>

          <div style={{ height: 16 }} />

          {/* PaymentElement — cards + Link autofill. Link is enabled by
              default; we don't opt out because it materially bumps
              conversion on returning shoppers. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.42, delay: 0.34, ease: EASE_OUT }}
          >
            {!paymentElementReady && <ElementSkeleton />}
            <PaymentElement
              onReady={() => setPaymentElementReady(true)}
              options={{
                layout: { type: "tabs", defaultCollapsed: false },
                defaultValues: answers.email ? { billingDetails: { email: answers.email } } : undefined,
                wallets: { applePay: "never", googlePay: "never" },
                fields: {
                  billingDetails: {
                    email: "auto",
                    name: "auto",
                  },
                },
                terms: {
                  card: "never",
                },
              }}
            />
          </motion.div>

          {error && (
            <>
              <div style={{ height: 12 }} />
              <p
                role="alert"
                style={{
                  fontFamily: "Poppins, -apple-system, sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#FF6B6B",
                  lineHeight: 1.45,
                  margin: 0,
                }}
              >
                {error}
              </p>
            </>
          )}

          <div style={{ height: 20 }} />

          <p
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 12,
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.5,
              margin: 0,
              textAlign: "center",
            }}
          >
            We&apos;ll email a reminder 2 days before your trial ends.
            You can cancel any time in the app.
          </p>
        </div>
      </div>

      {/* Sticky CTA — visual match with TrialPaywall7DayStep */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.42, delay: 0.5, ease: EASE_OUT }}
        style={{
          padding: "12px 25px 16px",
          background: colors.black,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          type="button"
          onClick={handleConfirm}
          disabled={submitting || !stripe || !elements}
          style={{
            width: "100%",
            padding: "18px 0",
            borderRadius: 40,
            border: "none",
            background: colors.white,
            color: colors.black,
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            cursor: submitting ? "wait" : "pointer",
            opacity: submitting || !stripe || !elements ? 0.6 : 1,
            transition: "opacity 200ms ease",
          }}
        >
          {submitting ? "Starting your trial…" : "Start my 7-day trial"}
        </button>
        <div style={{ height: 10 }} />
        <p
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: "#fff",
            lineHeight: 1.5,
            textAlign: "center",
            margin: 0,
          }}
        >
          No charge today. Cancel anytime.
        </p>
      </motion.div>
    </div>
  );
}

function FullScreenLoader() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.black,
        color: colors.white,
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        style={{ animation: "keshah-spin 700ms linear infinite" }}
      >
        <style>{`@keyframes keshah-spin { to { transform: rotate(360deg); } }`}</style>
        <circle cx="12" cy="12" r="10" stroke="#fff" strokeOpacity="0.25" strokeWidth="3" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function FullScreenError({ message }: { message: string }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: colors.black,
        color: colors.white,
        padding: 32,
      }}
    >
      <p
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 14,
          color: "rgba(255,255,255,0.75)",
          textAlign: "center",
          maxWidth: 320,
        }}
      >
        {message}
      </p>
    </div>
  );
}

function ElementSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        height: 180,
        borderRadius: 10,
        background:
          "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.08) 50%, rgba(255,255,255,0.04) 100%)",
        backgroundSize: "200% 100%",
        animation: "keshah-shimmer 1.2s linear infinite",
      }}
    >
      <style>{`@keyframes keshah-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
    </div>
  );
}
