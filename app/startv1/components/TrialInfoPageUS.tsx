"use client";

// /startfree (US) trial info page — 3-day free trial → $99/year via RC.
// Visual structure modeled after the iOS trial-info pattern: large
// headline, square rounded-corner icons (not round dots), tight copy,
// legal footer below the primary CTA.

import { useEffect, useState } from "react";
import { mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";
import { purchasePackage, warmup, isUserCancelledError } from "../lib/revenuecat";
import { RC_PACKAGE_ANNUAL } from "../lib/revenuecat-packages";
import { useFlow } from "../lib/flow-context";

interface Props {
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

const GREEN = "#4CAF50";
const BG = "#000";
const TEXT = "#fff";
const TEXT_DIM = "rgba(255,255,255,0.72)";
const TEXT_FAINT = "rgba(255,255,255,0.45)";

export default function TrialInfoPageUS({ onClose, onPurchaseSuccess }: Props) {
  const { updateAnswers } = useFlow();
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    warmup();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleStartTrial = async () => {
    if (purchasing) return;
    mediumHaptic();
    setPurchasing(true);
    setErrorMessage(null);

    try {
      const result = await purchasePackage(RC_PACKAGE_ANNUAL);
      if (!result) {
        throw new Error("Checkout not available. Please try again.");
      }
      // Stash the redemption deep link for PurchaseSuccess (see Us3PlanModal).
      const redeemUrl = result.redemptionInfo?.redeemUrl ?? undefined;
      if (redeemUrl) updateAnswers({ rcRedeemUrl: redeemUrl });
      // Fire Purchase at $99 (expected annual value) so Meta's algo has
      // a real value signal for value-optimization campaigns. Accept
      // slight over-attribution on trial cancels — net signal quality
      // is better than $0.
      void trackPurchaseWithCAPI({ value: 99, currency: "USD" });
      onPurchaseSuccess();
    } catch (err) {
      const cancelled = await isUserCancelledError(err);
      if (!cancelled) {
        // eslint-disable-next-line no-console
        console.error("[TrialInfoPageUS] error:", err);
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      }
      setPurchasing(false);
    }
  };

  const steps: Array<{ title: string; body: React.ReactNode; icon: React.ReactNode }> = [
    {
      title: "Today",
      body: (
        <>
          Unlock full access for free.
          <br />
          You don&apos;t have to pay anything.
        </>
      ),
      icon: <UnlockIcon />,
    },
    {
      title: "Day 2",
      body: "We'll email you before your trial ends.",
      icon: <BellIcon />,
    },
    {
      title: "Day 3",
      body: "Subscription starts. You can cancel easily before this date.",
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
      {/* Body — no scroll, fits in one screen */}
      <div
        style={{
          flex: 1,
          overflow: "hidden",
        }}
      >
      <div
        style={{
          padding: "28px 36px 20px",
          maxWidth: 520,
          width: "100%",
          margin: "0 auto",
          display: "flex",
          flexDirection: "column",
          height: "100%",
          boxSizing: "border-box",
        }}
      >
        {/* Headline — left-aligned, matches /start paywall headline style */}
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: "-1.2px",
            lineHeight: 1.3,
            margin: 0,
            textAlign: "left",
            fontFamily: "inherit",
          }}
        >
          I want you to try KESHAH
          <br />
          for free.
        </h1>
        <p
          style={{
            fontSize: 15,
            fontWeight: 500,
            color: TEXT,
            textAlign: "left",
            lineHeight: 1.4,
            margin: "12px 0 28px",
            fontFamily: "inherit",
          }}
        >
          In 3 days you&apos;ll notice your scalp start to loosen.
          Hair fall generally stops in 60 days.
        </p>

        {/* Timeline */}
        <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 0 }}>
          {steps.map((s, i) => {
            const isLast = i === steps.length - 1;
            return (
              <div key={s.title} style={{ display: "flex", alignItems: "stretch" }}>
                {/* Icon column */}
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
                {/* Text column */}
                <div
                  style={{
                    flex: 1,
                    paddingLeft: 16,
                    paddingBottom: isLast ? 0 : 28,
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
            borderTop: `1px dashed rgba(255,255,255,0.15)`,
            margin: "4px 0 16px",
          }}
        />

        {/* Subscription terms */}
        <p
          style={{
            fontSize: 14,
            color: TEXT_DIM,
            textAlign: "left",
            lineHeight: 1.5,
            margin: "0 0 20px",
          }}
        >
          Subscription starts at $99/year ($8.25/mo).
          <br />
          Cancel anytime.
        </p>

        {errorMessage && (
          <p style={{ color: "#ff6b6b", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
            {errorMessage}
          </p>
        )}

        <div style={{ flex: 1 }} />
      </div>
      </div>

      {/* Sticky CTA + footer — matches TrialPaywall .cta + .ctaButton exactly */}
      <div
        style={{
          flexShrink: 0,
          padding: "12px 25px calc(env(safe-area-inset-bottom) + 16px)",
          background: BG,
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
        }}
      >
        <button
          type="button"
          onClick={handleStartTrial}
          disabled={purchasing}
          style={{
            display: "block",
            maxWidth: 560,
            margin: "0 auto",
            width: "100%",
            padding: "18px 0",
            background: "#fff",
            color: "#000",
            fontSize: 16,
            fontWeight: 500,
            border: "none",
            borderRadius: 40,
            fontFamily: "inherit",
            cursor: purchasing ? "default" : "pointer",
            opacity: purchasing ? 0.6 : 1,
            WebkitTapHighlightColor: "transparent",
            outline: "none",
            overflow: "hidden",
            whiteSpace: "nowrap",
            textOverflow: "ellipsis",
            lineHeight: "20px",
          }}
        >
          <span style={{ display: "inline-block" }}>
            {purchasing ? "Sending you to secure checkout…" : "Try 3 days free"}
          </span>
        </button>

        {/* Reassurance below button — matches TrialPaywall .ctaSub */}
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
          No payment due today. Cancel in app anytime.
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
