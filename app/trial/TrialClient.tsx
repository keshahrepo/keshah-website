"use client";

// Inline-checkout paywall — Aadi's lean v3.
//
// Deliberately close to the existing /start paywall structure so we can
// isolate what shipping inline Stripe Elements alone does to conversion.
// If this version moves the needle vs the current Stripe-hosted flow, we
// know the checkout mechanism was the killer. If not, we know we need to
// layer in more trust/value elements and we do that one at a time.
//
// Order top-to-bottom:
//   Nav (KESHAH logo)
//   Hook + subhead (same as /start's paywall)
//   Timeline (same 5 steps + dashed post-trial divider + green post-trial dots)
//   Pricing table (flat invoice)
//   Continue CTA → smooth reveal:
//     Billing details (email + Stripe PaymentElement)
//     Explicit charge statement
//     BUILT BY AADI (Instagram + TikTok screenshots + App/Play Store ratings)
//     Start my 7 days free →
//
// Personalized plan card, Now/After blood vessel, credibility hero are
// gone in this pass — those live earlier in the /start funnel and don't
// need to be re-shown here.

import { motion, AnimatePresence } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe as StripeJs, type StripeElementsOptions } from "@stripe/stripe-js";

const FONT = "Poppins, -apple-system, sans-serif";
const BLACK = "#000000";
const WHITE = "#FFFFFF";
const GREEN = "#359033";
const EASE_OUT_QUINT = [0.16, 1, 0.3, 1] as const;
const STORAGE_KEY = "keshah_start_state_v21";
const CHECKOUT_ANCHOR_ID = "trial-checkout";

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// ────────────────────────────────────────────────────────────────────────
// Root
// ────────────────────────────────────────────────────────────────────────

export default function TrialClient() {
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: BLACK,
        color: WHITE,
        display: "flex",
        flexDirection: "column",
        fontFamily: FONT,
      }}
    >
      <Nav />
      <main
        style={{
          flex: 1,
          padding: "24px 24px 40px",
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
          boxSizing: "border-box",
        }}
      >
        <Hook />
        <div style={{ height: 36 }} />
        <Timeline />
        <div style={{ height: 32 }} />
        <PricingTable />
        <div style={{ height: 28 }} />
        <BuiltByAadi />
        <div style={{ height: 28 }} />

        {!checkoutOpen && (
          <ContinueCta
            onClick={() => {
              // Fire `payment` FunnelEvent — under the old flow this fired
              // when PaymentStep mounted on advance. Inline reveal doesn't
              // advance, so we log it here to keep the dashboard's
              // paywall → checkout drop-off metric alive.
              try {
                if (typeof window !== "undefined") {
                  let sessionId = sessionStorage.getItem("keshah_funnel_session");
                  if (!sessionId) {
                    sessionId = crypto.randomUUID();
                    sessionStorage.setItem("keshah_funnel_session", sessionId);
                  }
                  const source = (() => {
                    const p = window.location.pathname;
                    if (p.startsWith("/startindiafree2")) return "india_premium_trial";
                    if (p.startsWith("/startindia2")) return "india2";
                    if (p.startsWith("/startindia3")) return "india3";
                    if (p.startsWith("/startindia")) return "india";
                    if (p.startsWith("/f/")) {
                      const slug = p.split("/")[2];
                      return slug ? `us_creator_${slug}` : "us_creator_unknown";
                    }
                    if (p.startsWith("/mandy")) return "us_women_mandy";
                    if (p.startsWith("/startus3")) return "us_weekly_trial";
                    if (p.startsWith("/startus2")) return "us_kit";
                    if (p.startsWith("/startfree")) return "us_trial";
                    return "us";
                  })();
                  fetch("/api/funnel/track", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ step: "payment", sessionId, source }),
                    keepalive: true,
                  }).catch(() => {});
                }
              } catch {}
              setCheckoutOpen(true);
            }}
          />
        )}

        <AnimatePresence initial={false}>
          {checkoutOpen && (
            <motion.div
              key="checkout"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.45, ease: EASE_OUT_QUINT }}
              onAnimationComplete={() => {
                window.setTimeout(() => {
                  document
                    .getElementById(CHECKOUT_ANCHOR_ID)
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 60);
              }}
              id={CHECKOUT_ANCHOR_ID}
            >
              <div style={{ height: 20 }} />
              <CheckoutSection />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Nav
// ────────────────────────────────────────────────────────────────────────

function Nav() {
  return (
    <div
      style={{
        padding: "18px 24px",
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
        display: "flex",
        alignItems: "center",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/keshah-logo-white.png"
        alt="KESHAH"
        style={{ height: 34, width: "auto", display: "block" }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Hook — matches /start's paywall copy exactly.
// ────────────────────────────────────────────────────────────────────────

function Hook() {
  return (
    <div>
      <h1
        style={{
          margin: 0,
          fontSize: 26,
          fontWeight: 600,
          letterSpacing: -1.2,
          lineHeight: 1.25,
        }}
      >
        Try KESHAH free for a week.
      </h1>
      <div style={{ height: 12 }} />
      <p
        style={{
          margin: 0,
          fontSize: 15,
          fontWeight: 500,
          lineHeight: 1.4,
          color: WHITE,
        }}
      >
        If your scalp feels looser in 7 days, keep going. If not, cancel and
        pay nothing.
      </p>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Timeline — dashed divider before post-trial rows, green dots + green
// connectors for Day 60-90 / Day 90+. Direct port of the /start paywall's
// design so we're testing checkout mechanism, not layout deltas.
// ────────────────────────────────────────────────────────────────────────

interface TimelineStep {
  title: string;
  body: string;
  inTrial: boolean;
}

const TIMELINE: TimelineStep[] = [
  { title: "Today", body: "Full access unlocked. No payment.", inTrial: true },
  { title: "Day 1-6", body: "Scalp starts to loosen.", inTrial: true },
  { title: "Day 7", body: "Plan starts. Cancel before this easily.", inTrial: true },
  { title: "Day 60-90", body: "Hair fall stops.", inTrial: false },
  { title: "Day 90+", body: "Keep your results.", inTrial: false },
];

function DashedVerticalLine({ height }: { height: number | string }) {
  return (
    <div
      aria-hidden
      style={{
        width: 2,
        height,
        backgroundImage:
          "linear-gradient(to bottom, rgba(255,255,255,0.35) 50%, transparent 50%)",
        backgroundSize: "2px 8px",
        backgroundRepeat: "repeat-y",
      }}
    />
  );
}

function Timeline() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {TIMELINE.map((step, i) => {
        const prev = i > 0 ? TIMELINE[i - 1] : null;
        const next = i < TIMELINE.length - 1 ? TIMELINE[i + 1] : null;
        const isFirstPostTrial = prev != null && prev.inTrial && !step.inTrial;
        const isLast = next == null;
        const connectorDashed = next != null && next.inTrial !== step.inTrial;
        return (
          <div key={step.title}>
            {isFirstPostTrial && <TimelineDivider />}
            <StepRow
              step={step}
              isLast={isLast}
              connectorDashed={connectorDashed}
            />
          </div>
        );
      })}
    </div>
  );
}

function TimelineDivider() {
  return (
    <div style={{ display: "flex", alignItems: "stretch", minHeight: 40, paddingBottom: 20 }}>
      <div style={{ width: 28, display: "flex", justifyContent: "center", alignItems: "stretch" }}>
        <DashedVerticalLine height="100%" />
      </div>
      <div style={{ flex: 1, paddingLeft: 14, display: "flex", alignItems: "center" }}>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          IF YOU CONTINUE AFTER DAY 7
        </span>
      </div>
    </div>
  );
}

function StepRow({
  step,
  isLast,
  connectorDashed,
}: {
  step: TimelineStep;
  isLast: boolean;
  connectorDashed: boolean;
}) {
  const dotColor = step.inTrial ? WHITE : GREEN;
  const solidConnectorColor = step.inTrial
    ? "rgba(255,255,255,0.35)"
    : "rgba(76,175,80,0.85)";

  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      <div style={{ width: 28, display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div
          style={{
            marginTop: 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: dotColor,
          }}
        />
        {!isLast && (
          <div
            style={{
              flex: 1,
              padding: "4px 0",
              display: "flex",
              justifyContent: "center",
              alignItems: "stretch",
              width: "100%",
            }}
          >
            {connectorDashed ? (
              <DashedVerticalLine height="100%" />
            ) : (
              <div style={{ width: 2, background: solidConnectorColor }} />
            )}
          </div>
        )}
      </div>
      <div
        style={{
          flex: 1,
          paddingLeft: 14,
          paddingBottom: isLast ? 0 : 20,
        }}
      >
        <div
          style={{
            fontFamily: FONT,
            fontSize: 18,
            fontWeight: 600,
            color: WHITE,
            lineHeight: 1.25,
            letterSpacing: "-0.2px",
          }}
        >
          {step.title}
        </div>
        <div style={{ height: 4 }} />
        <div
          style={{
            fontFamily: FONT,
            fontSize: 13,
            fontWeight: 400,
            color: WHITE,
            lineHeight: 1.45,
          }}
        >
          {step.body}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Pricing table — flat invoice, all-white text.
// ────────────────────────────────────────────────────────────────────────

function PricingTable() {
  return (
    <div
      style={{
        padding: 18,
        borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      <PricingRow label="Total today" value="$0" />
      <PricingDivider />
      <PricingRow label="7-day free trial" value="$0" />
      <PricingDivider />
      <PricingRow label="Price after trial" value="$33/month" />
      <div style={{ height: 4 }} />
      <div
        style={{
          textAlign: "right",
          fontSize: 11,
          color: "rgba(255,255,255,0.5)",
        }}
      >
        Billed $99 every 3 months
      </div>
    </div>
  );
}

function PricingRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "10px 0",
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500, color: WHITE }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: WHITE }}>{value}</span>
    </div>
  );
}

function PricingDivider() {
  return <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />;
}

// ────────────────────────────────────────────────────────────────────────
// Continue CTA
// ────────────────────────────────────────────────────────────────────────

function ContinueCta({ onClick }: { onClick: () => void }) {
  return (
    <div style={{ paddingTop: 8 }}>
      <button
        type="button"
        onClick={onClick}
        style={{
          width: "100%",
          padding: "18px 0",
          borderRadius: 40,
          border: "none",
          background: WHITE,
          color: BLACK,
          fontFamily: FONT,
          fontSize: 16,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Continue
      </button>
      <div
        style={{
          textAlign: "center",
          marginTop: 10,
          fontSize: 12,
          fontWeight: 500,
          color: "rgba(255,255,255,0.65)",
        }}
      >
        $0 today. Cancel anytime.
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Checkout section — one-shot: email + Stripe PaymentElement + charge
// statement + BUILT BY AADI trust anchors below the card, then final CTA.
// ────────────────────────────────────────────────────────────────────────

interface IntentResponse {
  ok: boolean;
  error?: string;
  subscriptionId?: string;
  customerId?: string;
  clientSecret?: string;
  publishableKey?: string | null;
  returnUrl?: string;
}

function CheckoutSection() {
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

  // Bootstrap the subscription intent immediately on mount. Email is
  // collected inside the Stripe PaymentElement (fields=billingDetails full
  // → link_email + link_authentication) so no separate email step needed
  // before mounting Elements — the intent creation just needs a placeholder.
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
          const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
          return m ? m[1] : "";
        };
        const fbp = readCookie("_fbp");
        const fbc = readCookie("_fbc");

        let quizAnswers: Record<string, unknown> = {};
        try {
          const raw = window.localStorage.getItem(STORAGE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as { answers?: Record<string, unknown> };
            quizAnswers = parsed.answers ?? {};
          }
        } catch {
          // ignore
        }
        quizAnswers = {
          ...quizAnswers,
          timezone,
          timezone_offset_mins,
          fbp,
          fbc,
        };

        // Placeholder email — the actual customer email will be captured
        // by Stripe's PaymentElement (billing_details.email) and updated on
        // the Customer via `stripe.confirmSetup` metadata handling.
        const res = await fetch("/api/stripe/create-subscription-intent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: `pending+${Date.now()}@keshah.com`,
            quizAnswers,
          }),
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
  }, []);

  const trialEndsFormatted = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  }, []);

  return (
    <div>
      <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600, color: WHITE }}>
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
          }}
        >
          Something went wrong preparing checkout: {state.message}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// Stripe Elements
// ────────────────────────────────────────────────────────────────────────

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
            // especially Chase/Capital One/Amex). Email collected inside
            // the element too so we skip a separate input.
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
            // information..." mandate text. Our charge statement below
            // the PaymentElement covers the same cancel language; the
            // Stripe text was just noise on top of it.
            terms: {
              card: "never",
              applePay: "never",
              googlePay: "never",
            },
          }}
        />
      </div>

      <div style={{ height: 18 }} />
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
      }}
    >
      Your 7 day trial lasts until{" "}
      <span style={{ fontWeight: 600, color: WHITE }}>{date}</span>. You can
      easily cancel your subscription in the app anytime before then.
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────
// BUILT BY AADI — trust anchors positioned at the moment of card ask.
// IG + TikTok profile screenshots stacked full-width, App Store + Play
// Store rating screenshots side-by-side below them. All authentic
// screenshots the user could verify.
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
          textAlign: "left",
        }}
      >
        BUILT BY AADI
      </div>
      <div style={{ height: 14 }} />

      {/* IG + TikTok side-by-side (was stacked full-width, too tall). Both
          source files are pre-cropped to identity + stats bands with
          similar aspect ratios, so halving the column width halves their
          height cleanly — no cropping needed. */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <ScreenshotFrame
          src="/trial/aadi_instagram.jpg"
          alt="Aadi's Instagram — @aadi.keshah, 50.7K followers"
        />
        <ScreenshotFrame
          src="/trial/aadi_tiktok.jpg"
          alt="Aadi's TikTok — @aadi.keshah, 85.5K followers, 1.3M likes"
        />
      </div>

      <div style={{ height: 10 }} />

      {/* App Store + Play Store side by side, tighter aspect (4:3, not
          square) so they take less vertical space. */}
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
