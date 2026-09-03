"use client";

// Inline Stripe Elements checkout — shared between:
//   - /trial (standalone test page, reads quiz answers from localStorage)
//   - /start's TrialPaywall step (uses answers passed as a prop from useFlow)
//
// Flow:
//   1. On mount, POST to /api/stripe/create-subscription-intent to create
//      a Customer + SetupIntent (NOT a subscription — that's created in
//      the webhook once setup succeeds, so we never leak ghost subs).
//   2. Mount Stripe Elements with the returned SetupIntent client_secret.
//   3. User enters card, taps CTA, stripe.confirmSetup() confirms the
//      setup + redirects to /success on plan-confirmed.
//   4. Bridge /success page polls PaidWebSessions/{setup_intent_id} for
//      the webhook's write, then walks the user through sign-in +
//      attach-identity.
//
// Trust anchors (BUILT BY AADI + Aadi socials + App/Play Store ratings)
// live below the PaymentElement, above the final CTA — so the last thing
// the user reads before tapping is a wall of proof.

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from "@stripe/react-stripe-js";
import {
  loadStripe,
  type Stripe as StripeJs,
  type StripeElementsOptions,
} from "@stripe/stripe-js";

const FONT = "Poppins, -apple-system, sans-serif";
const BLACK = "#000000";
const WHITE = "#FFFFFF";
const EASE_OUT_QUINT = [0.16, 1, 0.3, 1] as const;
const STORAGE_KEY = "keshah_start_state_v21";
const ANCHOR_ID = "inline-checkout";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface Props {
  // If provided, these override the localStorage-hydrated answers. Passed
  // by /start's TrialPaywall step (from useFlow). Omitted on the /trial
  // standalone page — falls back to localStorage.
  quizAnswers?: Record<string, unknown>;
  // When true, mounts as a revealed block (fade+slide in) with auto-
  // scroll. Callers pass `revealed` when they toggled it from a Continue
  // button so the transition feels intentional.
  revealed: boolean;
}

// ────────────────────────────────────────────────────────────────────────
// Root — the reveal wrapper + the CheckoutSection.
// ────────────────────────────────────────────────────────────────────────

export default function InlineCheckout({ quizAnswers, revealed }: Props) {
  return (
    <AnimatePresence initial={false}>
      {revealed && (
        <motion.div
          key="inline-checkout"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
          onAnimationComplete={() => {
            window.setTimeout(() => {
              document
                .getElementById(ANCHOR_ID)
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 60);
          }}
          id={ANCHOR_ID}
        >
          <div style={{ height: 20 }} />
          <CheckoutSection quizAnswersProp={quizAnswers} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ────────────────────────────────────────────────────────────────────────
// CheckoutSection
// ────────────────────────────────────────────────────────────────────────

interface IntentResponse {
  ok: boolean;
  error?: string;
  setupIntentId?: string;
  customerId?: string;
  clientSecret?: string;
  publishableKey?: string | null;
  returnUrl?: string;
}

function CheckoutSection({
  quizAnswersProp,
}: {
  quizAnswersProp?: Record<string, unknown>;
}) {
  const createInFlight = useRef(false);
  const [state, setState] = useState<
    | { phase: "loading" }
    | {
        phase: "ready";
        clientSecret: string;
        returnUrl: string;
        stripePromise: Promise<StripeJs | null>;
      }
    | { phase: "error"; message: string }
  >({ phase: "loading" });

  useEffect(() => {
    if (createInFlight.current) return;
    createInFlight.current = true;

    (async () => {
      try {
        let timezone = "";
        let timezone_offset_mins = 0;
        try {
          timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
          timezone_offset_mins = -new Date().getTimezoneOffset();
        } catch {
          // Old browsers — server falls back to America/New_York.
        }
        const readCookie = (name: string): string => {
          if (typeof document === "undefined") return "";
          const m = document.cookie.match(
            new RegExp("(?:^|; )" + name + "=([^;]*)"),
          );
          return m ? m[1] : "";
        };
        const fbp = readCookie("_fbp");
        const fbc = readCookie("_fbc");

        // Prefer the prop (passed by /start via useFlow) over localStorage.
        let quizAnswers: Record<string, unknown> = {};
        if (quizAnswersProp && Object.keys(quizAnswersProp).length > 0) {
          quizAnswers = { ...quizAnswersProp };
        } else {
          try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as {
                answers?: Record<string, unknown>;
              };
              quizAnswers = parsed.answers ?? {};
            }
          } catch {
            // ignore
          }
        }
        quizAnswers = {
          ...quizAnswers,
          timezone,
          timezone_offset_mins,
          fbp,
          fbc,
        };

        const res = await fetch("/api/stripe/create-subscription-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quizAnswers }),
        });
        const data = (await res.json().catch(() => ({}))) as IntentResponse;
        if (
          !res.ok ||
          !data.ok ||
          !data.clientSecret ||
          !data.publishableKey ||
          !data.returnUrl
        ) {
          throw new Error(data.error ?? `intent_create_${res.status}`);
        }
        setState({
          phase: "ready",
          clientSecret: data.clientSecret,
          returnUrl: data.returnUrl,
          stripePromise: loadStripe(data.publishableKey),
        });
      } catch (err) {
        createInFlight.current = false;
        setState({
          phase: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
  }, [quizAnswersProp]);

  const trialEndsFormatted = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }, []);

  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: WHITE, fontFamily: FONT }}>
        Billing details
      </h3>
      <div style={{ height: 10 }} />
      <p
        style={{
          margin: 0,
          fontSize: 13,
          fontWeight: 400,
          color: "rgba(255,255,255,0.7)",
          lineHeight: 1.5,
          fontFamily: FONT,
        }}
      >
        If you cancel any time before your trial ends you won&apos;t be
        charged. All billing details are secure and encrypted.
      </p>

      <div style={{ height: 18 }} />

      {state.phase === "loading" && (
        <div
          style={{
            padding: 24,
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.04)",
            textAlign: "center",
            color: "rgba(255,255,255,0.6)",
            fontSize: 13,
            fontFamily: FONT,
          }}
        >
          Preparing checkout…
        </div>
      )}

      {state.phase === "ready" && (
        <ElementsProviderWrapper
          clientSecret={state.clientSecret}
          returnUrl={state.returnUrl}
          stripePromise={state.stripePromise}
          trialEndsFormatted={trialEndsFormatted}
        />
      )}

      {state.phase === "error" && (
        <div
          style={{
            padding: 16,
            borderRadius: 10,
            background: "rgba(220,53,69,0.1)",
            border: "1px solid rgba(220,53,69,0.35)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            lineHeight: 1.5,
            fontFamily: FONT,
          }}
        >
          Something went wrong preparing checkout: {state.message}
        </div>
      )}
    </div>
  );
}

function ElementsProviderWrapper({
  clientSecret,
  returnUrl,
  stripePromise,
  trialEndsFormatted,
}: {
  clientSecret: string;
  returnUrl: string;
  stripePromise: Promise<StripeJs | null>;
  trialEndsFormatted: string;
}) {
  const options: StripeElementsOptions = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: "night",
        variables: {
          fontFamily: FONT,
          colorPrimary: WHITE,
          colorBackground: "rgba(0,0,0,0.4)",
          colorText: WHITE,
          colorTextSecondary: "rgba(255,255,255,0.7)",
          colorDanger: "#DC3545",
          borderRadius: "8px",
        },
      },
    }),
    [clientSecret],
  );

  return (
    <Elements stripe={stripePromise} options={options}>
      <PaymentForm returnUrl={returnUrl} trialEndsFormatted={trialEndsFormatted} />
    </Elements>
  );
}

function PaymentForm({
  returnUrl,
  trialEndsFormatted,
}: {
  returnUrl: string;
  trialEndsFormatted: string;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;
    setError(null);
    setSubmitting(true);

    const result = await stripe.confirmSetup({
      elements,
      confirmParams: { return_url: returnUrl },
    });

    if (result.error) {
      setError(
        result.error.message ??
          "We couldn't process your card. Please try again.",
      );
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div
        style={{
          padding: 18,
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.1)",
          background: "rgba(255,255,255,0.04)",
        }}
      >
        <PaymentElement
          options={{
            layout: "tabs",
            // US-only traffic. Hardcode country=US so the dropdown never
            // renders; keep ZIP so post-trial $99 charges get AVS from the
            // issuing bank (missing ZIP → ~5-10% higher decline rate,
            // especially Chase/Capital One/Amex).
            fields: {
              billingDetails: {
                email: "auto",
                address: {
                  country: "never",
                  postalCode: "auto",
                },
              },
            },
            defaultValues: {
              billingDetails: {
                address: { country: "US" },
              },
            },
            wallets: { applePay: "auto", googlePay: "auto" },
            // Hide Stripe's auto-generated "By providing your card
            // information..." mandate text — the charge statement below
            // covers the equivalent cancel language.
            terms: {
              card: "never",
              applePay: "never",
              googlePay: "never",
            },
          }}
        />
      </div>

      <div style={{ height: 26 }} />
      <BuiltByAadi />
      <div style={{ height: 20 }} />
      <ChargeStatement date={trialEndsFormatted} />
      <div style={{ height: 18 }} />

      {error && (
        <div
          style={{
            padding: 12,
            borderRadius: 8,
            background: "rgba(220,53,69,0.1)",
            border: "1px solid rgba(220,53,69,0.35)",
            color: "rgba(255,255,255,0.9)",
            fontSize: 13,
            lineHeight: 1.5,
            marginBottom: 12,
            fontFamily: FONT,
          }}
        >
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        style={{
          width: "100%",
          padding: "18px 0",
          borderRadius: 40,
          border: "none",
          background: !stripe || submitting ? "rgba(255,255,255,0.7)" : WHITE,
          color: BLACK,
          fontFamily: FONT,
          fontSize: 16,
          fontWeight: 600,
          cursor: !stripe || submitting ? "wait" : "pointer",
        }}
      >
        {submitting ? "Starting your trial…" : "Try 7 days free"}
      </button>
    </form>
  );
}

function ChargeStatement({ date }: { date: string }) {
  return (
    <div
      style={{
        padding: 14,
        borderRadius: 10,
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        fontSize: 12,
        fontWeight: 400,
        color: "rgba(255,255,255,0.75)",
        lineHeight: 1.5,
        fontFamily: FONT,
      }}
    >
      Your 7 day trial lasts until{" "}
      <span style={{ fontWeight: 600, color: WHITE }}>{date}</span>. You can
      easily cancel your subscription in the app anytime before then.
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// BUILT BY AADI — trust anchors at the moment of card ask.
// ────────────────────────────────────────────────────────────────────────

function BuiltByAadi() {
  return (
    <div>
      <div
        style={{
          fontFamily: FONT,
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: 1.5,
          color: "rgba(255,255,255,0.5)",
          textAlign: "center",
        }}
      >
        BUILT BY AADI
      </div>
      <div style={{ height: 14 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <ScreenshotFrame
          src="/trial/aadi_instagram.jpg"
          alt="Aadi's Instagram — 50.7K followers"
        />
        <ScreenshotFrame
          src="/trial/aadi_tiktok.jpg"
          alt="Aadi's TikTok — 85.5K followers, 1.3M likes"
        />
      </div>

      <div style={{ height: 10 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <RatingFrame
          src="/trial/app_store_rating.jpg"
          alt="App Store rating — 4.8 stars from 717 ratings"
          background="#000000"
        />
        <RatingFrame
          src="/trial/play_store_rating.png"
          alt="Play Store rating — 4.8 stars from 8.76K reviews"
          background="#FFFFFF"
        />
      </div>
    </div>
  );
}

function ScreenshotFrame({ src, alt }: { src: string; alt: string }) {
  return (
    <div
      style={{
        width: "100%",
        borderRadius: 8,
        overflow: "hidden",
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{ display: "block", width: "100%", height: "auto" }}
      />
    </div>
  );
}

function RatingFrame({
  src,
  alt,
  background,
}: {
  src: string;
  alt: string;
  background: string;
}) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "4 / 3",
        borderRadius: 8,
        overflow: "hidden",
        background,
        border: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        style={{
          display: "block",
          maxWidth: "90%",
          maxHeight: "90%",
          width: "auto",
          height: "auto",
          objectFit: "contain",
        }}
      />
    </div>
  );
}
