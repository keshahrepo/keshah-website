"use client";

// 7-day trial variant of TrialInfoPageUS for the /watch ad funnel.
// Purchases the RC_PACKAGE_YEARLY_TRIAL package (annual + 7-day intro),
// which must be configured in RC dashboard with exact identifier "Yearly Trial".

import { useEffect, useState } from "react";
import { mediumHaptic } from "../../start/lib/haptics";
import { fbqTrackOnce, trackInitiateCheckoutWithCAPI, trackPurchaseWithCAPI } from "../../start/lib/fb-pixel";
import { trackCheckoutTikTok, trackPurchaseTikTok, ttqTrackOnce } from "../../start/lib/tiktok-pixel";
import { purchasePackage, warmup, isUserCancelledError } from "../../start/lib/revenuecat";
import { RC_PACKAGE_YEARLY_TRIAL } from "../../start/lib/revenuecat-packages";
import { useFlow } from "../../start/lib/flow-context";

interface Props {
  onPurchaseSuccess: () => void;
}

const GREEN = "#4CAF50";
const BG = "#000";
const TEXT = "#fff";
const TEXT_DIM = "rgba(255,255,255,0.72)";
const TEXT_FAINT = "rgba(255,255,255,0.45)";

export default function TrialInfoPage7Day({ onPurchaseSuccess }: Props) {
  const { updateAnswers } = useFlow();
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    warmup();
    // Mid-funnel signal: user reached the pricing/trial page. Meta + TikTok
    // both weight ViewContent as a stronger-than-PageView intent event.
    fbqTrackOnce("ViewContent", { content_name: "TrialInfoPage7Day" });
    ttqTrackOnce("ViewContent", {
      contents: [
        {
          content_id: "watch_trial_info_7day",
          content_type: "product",
          content_name: "TrialInfoPage7Day",
        },
      ],
    });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleStartTrial = async () => {
    if (purchasing) return;
    mediumHaptic();

    const purchaseValueUsd = 99;
    const contents = [
      {
        content_id: RC_PACKAGE_YEARLY_TRIAL,
        content_name: "KESHAH Yearly Trial (7-day)",
        quantity: 1,
        price: purchaseValueUsd,
      },
    ];

    // InitiateCheckout — fired the moment the user commits to the offer.
    // Uses the CAPI-backed helper so iOS ITP / ad blockers can't blackhole
    // the event and starve Meta's ad optimizer.
    void trackInitiateCheckoutWithCAPI({
      value: purchaseValueUsd,
      currency: "USD",
      contentName: contents[0].content_name,
      contentId: contents[0].content_id,
    });
    void trackCheckoutTikTok({
      value: purchaseValueUsd,
      currency: "USD",
      contents,
    });

    setPurchasing(true);
    setErrorMessage(null);

    try {
      const result = await purchasePackage(RC_PACKAGE_YEARLY_TRIAL);
      if (!result) {
        throw new Error("Checkout not available. Please try again.");
      }
      const redeemUrl = result.redemptionInfo?.redeemUrl ?? undefined;
      if (redeemUrl) updateAnswers({ rcRedeemUrl: redeemUrl });
      void trackPurchaseWithCAPI({ value: purchaseValueUsd, currency: "USD" });
      void trackPurchaseTikTok({ value: purchaseValueUsd, currency: "USD", contents });
      onPurchaseSuccess();
    } catch (err) {
      const cancelled = await isUserCancelledError(err);
      if (!cancelled) {
        // eslint-disable-next-line no-console
        console.error("[TrialInfoPage7Day] error:", err);
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      }
      setPurchasing(false);
    }
  };

  const steps: Array<{
    title: string;
    body: React.ReactNode;
    icon: React.ReactNode;
    /** true = happens during trial (billing mechanic).
     *  false = only happens if the user continues past Day 7 (outcome). */
    inTrial: boolean;
  }> = [
    {
      title: "Today",
      body: "Full access unlocked. No payment.",
      icon: <UnlockIcon />,
      inTrial: true,
    },
    {
      title: "Day 5",
      body: "Scalp starts to loosen.",
      icon: <SparkleIcon />,
      inTrial: true,
    },
    {
      title: "Day 7",
      body: "Subscription starts at $99/year ($8.25/mo). Cancel before this, pay $0.",
      icon: <HourglassIcon />,
      inTrial: true,
    },
    {
      title: "Day 60",
      body: "Hair fall generally stops.",
      icon: <ShieldCheckIcon />,
      inTrial: false,
    },
    {
      title: "Day 180",
      body: "New growth starts filling in.",
      icon: <SproutIcon />,
      inTrial: false,
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
      <div style={{ flex: 1, overflow: "hidden" }}>
        <div
          style={{
            padding: "28px 22px 20px",
            maxWidth: 520,
            width: "100%",
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            height: "100%",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 14,
              margin: "0 0 28px",
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: "50%",
                overflow: "hidden",
                border: "2px solid rgba(255,255,255,0.15)",
                flexShrink: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/aadi.png"
                alt="Aadi"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  objectPosition: "center top",
                  display: "block",
                }}
              />
            </div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 600,
                letterSpacing: "-1.2px",
                lineHeight: 1.25,
                margin: 0,
                textAlign: "center",
                fontFamily: "inherit",
              }}
            >
              Try KESHAH for free.
            </h1>
          </div>

          <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 0 }}>
            {steps.map((s, i) => {
              const isLast = i === steps.length - 1;
              const isFirstPostTrial = !s.inTrial && steps[i - 1]?.inTrial;
              return (
                <div key={s.title}>
                  {isFirstPostTrial && (
                    <div style={{ display: "flex", alignItems: "stretch" }}>
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
                            flex: 1,
                            width: 3,
                            marginTop: 2,
                            marginBottom: 6,
                            backgroundImage: `linear-gradient(${GREEN} 50%, transparent 50%)`,
                            backgroundSize: "3px 8px",
                            backgroundRepeat: "repeat-y",
                            opacity: 0.7,
                          }}
                        />
                      </div>
                      <div
                        style={{
                          flex: 1,
                          paddingLeft: 16,
                          paddingTop: 4,
                          paddingBottom: 14,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 600,
                            letterSpacing: 1.5,
                            color: TEXT_FAINT,
                            textTransform: "uppercase",
                          }}
                        >
                          If you continue after Day 7
                        </div>
                      </div>
                    </div>
                  )}
                <div style={{ display: "flex", alignItems: "stretch" }}>
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
                        background: s.inTrial ? GREEN : "transparent",
                        border: s.inTrial ? "none" : `1.5px solid ${GREEN}`,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                        color: s.inTrial ? "#fff" : GREEN,
                      }}
                    >
                      {s.icon}
                    </div>
                    {!isLast && (
                      <div
                        style={{
                          flex: 1,
                          width: 3,
                          marginTop: 2,
                          marginBottom: 2,
                          ...(steps[i + 1]?.inTrial === s.inTrial
                            ? { background: GREEN, opacity: 0.85 }
                            : {
                                backgroundImage: `linear-gradient(${GREEN} 50%, transparent 50%)`,
                                backgroundSize: "3px 8px",
                                backgroundRepeat: "repeat-y",
                                opacity: 0.7,
                              }),
                        }}
                      />
                    )}
                  </div>
                  <div
                    style={{
                      flex: 1,
                      paddingLeft: 16,
                      paddingBottom: isLast ? 0 : 20,
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
                </div>
              );
            })}
          </div>

          {errorMessage && (
            <p style={{ color: "#ff6b6b", fontSize: 13, textAlign: "center", marginBottom: 12 }}>
              {errorMessage}
            </p>
          )}

          <div style={{ flex: 1 }} />
        </div>
      </div>

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
            {purchasing ? "Sending you to secure checkout…" : "Try 7 days free"}
          </span>
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

function SparkleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v3" />
      <path d="M12 18v3" />
      <path d="M5.6 5.6l2.1 2.1" />
      <path d="M16.3 16.3l2.1 2.1" />
      <path d="M3 12h3" />
      <path d="M18 12h3" />
      <path d="M5.6 18.4l2.1-2.1" />
      <path d="M16.3 7.7l2.1-2.1" />
      <circle cx="12" cy="12" r="3" />
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

function ShieldCheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function SproutIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 20h10" />
      <path d="M10 20c5.5-2.5.8-6.4 3-10" />
      <path d="M9.5 9.4c1.1.8 1.8 2.2 2.3 3.7-2 .4-3.5.4-4.8-.3-1.2-.6-2.3-1.9-3-4.2 2.8-.5 4.4 0 5.5.8z" />
      <path d="M14.1 6a7 7 0 0 0-1.1 4c1.9-.1 3.3-.6 4.3-1.4 1-1 1.6-2.3 1.7-4.6-2.7.1-4 1-4.9 2z" />
    </svg>
  );
}
