"use client";

// /startus3 (+ /mandy, /f/) trial info page — sits between TrialPaywall
// "Continue" tap and checkout. Built off TrialInfoPageUS pattern: the CTA
// triggers the purchase directly (no plan-modal in between) so the funnel
// has a single clear offer rather than a tier-selection step that adds
// choice paralysis.
//
// Carries the asymmetric-offer message:
//   • Try KESHAH free for 3 days (timeline)
//   • Plus 5 free guides ($95 value) yours to keep, even if you cancel
//   • Best case / worst case framing in a founder-attributed box
//
// Theme-aware: dark for men's funnel, cream/light for women's (/mandy,
// /f/jennifer, /f/donna) so it doesn't visually crash the women's flow.
//
// Pricing: all Us3 funnels (men + women's creator routes) use the same
// 3-day free trial → $57/3mo package. Earlier the women's path was direct
// to payment; switched to trial for consistency + lower friction since
// cold TikTok creator traffic is just as low-trust as the men's traffic.

import { useEffect, useState } from "react";
import { mediumHaptic, lightHaptic } from "../lib/haptics";
import { useFunnelConfig } from "../lib/funnel-config";
import { fbqTrack, trackPurchaseWithCAPI } from "../lib/fb-pixel";
import { trackCheckoutTikTok, trackPurchaseTikTok } from "../lib/tiktok-pixel";
import {
  isConfigured,
  isUserCancelledError,
  purchasePackage,
  RC_PACKAGE_3MO_TRIAL,
  warmup,
} from "../lib/revenuecat";
import { useFlow } from "../lib/flow-context";

interface Props {
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

export default function Us3TrialInfo({ onClose, onPurchaseSuccess }: Props) {
  const { updateAnswers } = useFlow();
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const config = useFunnelConfig();
  const isLight = config.theme === "light";

  const BG = isLight ? "#F4EDE3" : "#000";
  const TEXT = isLight ? "#1a1a1a" : "#fff";
  const TEXT_DIM = isLight ? "rgba(26,26,26,0.72)" : "rgba(255,255,255,0.72)";
  const TEXT_FAINT = isLight ? "rgba(26,26,26,0.45)" : "rgba(255,255,255,0.45)";
  const BTN_BG = isLight ? "#1a1a1a" : "#fff";
  const BTN_FG = isLight ? "#fff" : "#000";
  const DIVIDER = isLight ? "rgba(26,26,26,0.15)" : "rgba(255,255,255,0.15)";
  const CARD_BORDER = isLight ? "rgba(26,26,26,0.10)" : "rgba(255,255,255,0.10)";
  const GREEN = "#4CAF50";

  // Women's funnel reframes the outcome: women relate to "thinning" as
  // their experience, men relate to "hair fall" / "hair loss".
  const isWomens = config.audience === "women";
  const lossTerm = isWomens ? "hair thinning" : "hair fall";

  // All Us3 paths now share the same 3-day-free-trial → $57/3mo package.
  const rcPackage = RC_PACKAGE_3MO_TRIAL;
  const tier = "threeMonthTrial" as const;
  const purchaseValueUsd = 57;

  useEffect(() => {
    warmup();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleStart = async () => {
    if (purchasing) return;
    mediumHaptic();
    setErrorMessage(null);

    const contents = [{
      content_id: tier,
      content_type: "product" as const,
      content_name: "3 Months (3-day trial)",
    }];

    // Fire InitiateCheckout right when the user commits to the offer.
    fbqTrack("InitiateCheckout", {
      value: purchaseValueUsd,
      currency: "USD",
      content_name: contents[0].content_name,
    });
    void trackCheckoutTikTok({
      value: purchaseValueUsd,
      currency: "USD",
      contents,
    });

    setPurchasing(true);

    // RC not configured (local stub) — skip the network call so the rest
    // of the funnel still runs in dev.
    if (!isConfigured()) {
      // eslint-disable-next-line no-console
      console.log("[Us3TrialInfo] Stub mode — RC not configured", { tier });
      updateAnswers({ purchaseTier: tier });
      void trackPurchaseWithCAPI({ value: purchaseValueUsd, currency: "USD" });
      void trackPurchaseTikTok({ value: purchaseValueUsd, currency: "USD", contents });
      onPurchaseSuccess();
      return;
    }

    try {
      const result = await purchasePackage(rcPackage);
      if (!result) {
        throw new Error("Checkout not available. Please try again.");
      }
      // Stash the redemption deep link so PurchaseSuccess can render the
      // "Open KESHAH" button + QR code. Same pattern as Us3PlanModal.
      const redeemUrl = result.redemptionInfo?.redeemUrl ?? undefined;
      if (redeemUrl) updateAnswers({ rcRedeemUrl: redeemUrl });
      updateAnswers({ purchaseTier: tier });
      void trackPurchaseWithCAPI({ value: purchaseValueUsd, currency: "USD" });
      void trackPurchaseTikTok({ value: purchaseValueUsd, currency: "USD", contents });
      onPurchaseSuccess();
    } catch (err) {
      const cancelled = await isUserCancelledError(err);
      if (!cancelled) {
        // eslint-disable-next-line no-console
        console.error("[Us3TrialInfo] error:", err);
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      }
      setPurchasing(false);
    }
  };

  const handleClose = () => {
    lightHaptic();
    onClose();
  };

  const steps: Array<{ title: string; body: React.ReactNode; icon: React.ReactNode }> = [
    {
      title: "Today",
      body: "Unlock full access to your plan + get 5 guides for free. You don't have to pay anything.",
      icon: <UnlockIcon />,
    },
    {
      title: "Day 2",
      body: "We'll email you before your trial ends.",
      icon: <BellIcon />,
    },
    {
      title: "Day 3",
      body: "$57 billed every 3 months. Cancel anytime before to avoid being charged. Keep the guides even if you cancel.",
      icon: <HourglassIcon />,
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: BG,
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Poppins, -apple-system, sans-serif",
        color: TEXT,
      }}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={handleClose}
        aria-label="Close"
        style={{
          position: "absolute",
          top: "calc(env(safe-area-inset-top) + 14px)",
          left: 16,
          width: 36,
          height: 36,
          borderRadius: 18,
          background: "transparent",
          border: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          cursor: "pointer",
          color: TEXT,
          zIndex: 2,
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 6L6 18M6 6l12 12" />
        </svg>
      </button>

      {/* Body — scrolls (guides + worst/best take more vertical space than TrialInfoPageUS) */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        <div
          style={{
            padding: "calc(env(safe-area-inset-top) + 60px) 28px 24px",
            maxWidth: 560,
            width: "100%",
            margin: "0 auto",
            boxSizing: "border-box",
          }}
        >
          {/* Headline */}
          <h1
            style={{
              fontSize: 26,
              fontWeight: 600,
              letterSpacing: "-1.2px",
              lineHeight: 1.3,
              margin: 0,
              textAlign: "left",
            }}
          >
            We want you to try your plan for free.
          </h1>
          <p
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: TEXT,
              textAlign: "left",
              lineHeight: 1.4,
              margin: "12px 0 28px",
            }}
          >
            In 3 days you&apos;ll notice your scalp start to loosen.
            {" "}{isWomens ? "Hair thinning" : "Hair fall"} generally stops in 60 days.
          </p>

          {/* Timeline */}
          <div style={{ marginBottom: 24, display: "flex", flexDirection: "column" }}>
            {steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              return (
                <div key={s.title} style={{ display: "flex", alignItems: "stretch" }}>
                  <div
                    style={{
                      width: 40,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: GREEN,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: "#fff",
                      }}
                    >
                      {s.icon}
                    </div>
                    {!isLast && (
                      <div
                        style={{
                          flex: 1,
                          width: 3,
                          background: GREEN,
                          opacity: 0.85,
                          marginTop: 2,
                          marginBottom: 2,
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      paddingLeft: 16,
                      paddingBottom: isLast ? 0 : 24,
                      paddingTop: 2,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 18,
                        fontWeight: 600,
                        color: TEXT,
                        lineHeight: 1.25,
                        letterSpacing: "-0.2px",
                      }}
                    >
                      {s.title}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 400,
                        color: TEXT_DIM,
                        lineHeight: 1.45,
                        marginTop: 4,
                      }}
                    >
                      {s.body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dashed divider */}
          <div
            style={{
              borderTop: `1px dashed ${DIVIDER}`,
              margin: "4px 0 20px",
            }}
          />

          {/* Founder box — attributing the best/worst-case framing to Aadi
              personally makes it feel like a direct offer from the founder,
              not impersonal marketing copy. Subtle background elevates the
              block without breaking the editorial cream/serif aesthetic. */}
          <div
            style={{
              marginBottom: 16,
              padding: 16,
              borderRadius: 14,
              background: isLight ? "rgba(0,0,0,0.04)" : "rgba(255,255,255,0.05)",
              border: `1px solid ${CARD_BORDER}`,
            }}
          >
            {/* Avatar + attribution. Creator funnels (/f/jennifer, /f/donna)
                show the creator's photo + name from their funnel config so
                the founder box stays visually consistent with the rest of
                the creator's funnel. Default (Aadi) for /startus3, /mandy,
                and any creator without a configured trust-quote photo. */}
            {(() => {
              const creator = config.paywallTrustQuote;
              const isCreator = !!(creator?.photo && creator?.name);
              const avatarSrc = isCreator ? creator!.photo! : "/images/aadi.png";
              const displayName = isCreator ? creator!.name! : "Aadi";
              const role = isCreator ? "Educator at KESHAH" : "Founder of KESHAH";
              return (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 12,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={avatarSrc}
                    alt={displayName}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: "50%",
                      objectFit: "cover",
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: TEXT }}>{displayName}</span>
                    <span style={{ fontSize: 12, color: TEXT_DIM, marginTop: 1 }}>{role}</span>
                  </div>
                </div>
              );
            })()}

            {/* Women: sensory promise anchored to the pinch test the user
                just took (less tight, less tender → first sign shedding
                slows), with the trial mechanics woven in.
                Men: best/worst case framing kept — the binary structure
                lands cleaner for the male audience and references hair
                fall rather than shedding. */}
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.55,
                color: TEXT,
                margin: 0,
              }}
            >
              {isWomens ? (
                <>
                  In a few days, you&apos;ll feel a difference in your scalp — less tight, less tender. That&apos;s the first sign your shedding is about to slow down. You won&apos;t be charged unless you decide to keep going after day 3 — and the 5 guides ($95 value) are yours either way.
                </>
              ) : (
                <>
                  <strong style={{ fontWeight: 600 }}>Best case</strong> — your {lossTerm} stops in 60-90 days. <strong style={{ fontWeight: 600 }}>Worst case</strong> — you cancel your trial and keep 5 hair-loss guides worth $95.
                </>
              )}
            </p>
          </div>

          <div style={{ height: 8 }} />
        </div>
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 25px calc(env(safe-area-inset-bottom) + 16px)",
          background: BG,
          borderTop: `1px solid ${CARD_BORDER}`,
        }}
      >
        {errorMessage && (
          <p
            style={{
              color: "#ff6b6b",
              fontSize: 13,
              textAlign: "center",
              marginBottom: 10,
            }}
          >
            {errorMessage}
          </p>
        )}
        <button
          type="button"
          onClick={handleStart}
          disabled={purchasing}
          style={{
            display: "block",
            maxWidth: 560,
            margin: "0 auto",
            width: "100%",
            padding: "18px 0",
            background: BTN_BG,
            color: BTN_FG,
            fontSize: 16,
            fontWeight: 500,
            border: "none",
            borderRadius: 40,
            fontFamily: "inherit",
            cursor: purchasing ? "default" : "pointer",
            opacity: purchasing ? 0.6 : 1,
            WebkitTapHighlightColor: "transparent",
            outline: "none",
            lineHeight: "20px",
          }}
        >
          {purchasing ? "Sending you to secure checkout…" : "Start free trial"}
        </button>
        <p
          style={{
            fontSize: 12,
            fontWeight: 400,
            color: TEXT_FAINT,
            textAlign: "center",
            lineHeight: 1.5,
            margin: "10px 0 0",
          }}
        >
          No payment due today · Keep the guides even if you cancel
        </p>
      </div>
    </div>
  );
}

function UnlockIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 9.9-1" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 2h12" />
      <path d="M6 22h12" />
      <path d="M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12l4.41-4.41A2 2 0 0 0 17 6.17V2H7v4.17a2 2 0 0 0 .59 1.42L12 12l-4.41 4.41A2 2 0 0 0 7 17.83V22" />
    </svg>
  );
}
