"use client";

// /startindiafree2 trial info page — 1-day free trial → ₹999/month via Razorpay.
// Visual mirrors TrialInfoPageUS (the /startfree US version) but adapted for
// India: ₹ pricing, Razorpay subscription mandate (1-day delay), 2-step
// timeline (Today / Day 2 — when subscription starts).

import { useEffect, useState } from "react";
import { mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";

interface Props {
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const PRICE_INR = 999;
const PLAN = "monthlyPremium";

const GREEN = "#4CAF50";
const BG = "#000";
const TEXT = "#fff";
const TEXT_DIM = "rgba(255,255,255,0.72)";
const TEXT_FAINT = "rgba(255,255,255,0.45)";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (event: string, handler: () => void) => void;
    };
  }
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.Razorpay) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Razorpay"));
    document.head.appendChild(script);
  });
}

export default function TrialInfoPageIndiaPremium({ onClose, onPurchaseSuccess }: Props) {
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    loadRazorpayScript().catch(() => {});
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

    // Min 5-sec hold so the "Sending to UPI verification" loading view has
    // time to register before Razorpay overlays it.
    const startedAt = Date.now();
    const MIN_LOADING_MS = 5000;

    try {
      await loadRazorpayScript();
      const subRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: PLAN,
          trial: true,
          trialDays: 1,
        }),
      });
      const subData = await subRes.json();
      if (!subData.ok) throw new Error(subData.error || "Subscription creation failed");

      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY,
        subscription_id: subData.subscriptionId,
        name: "KESHAH",
        description: "1-day free trial · ₹999/month after",
        theme: { color: "#000000" },
        modal: { ondismiss: () => { setPurchasing(false); } },
        handler: (response: {
          razorpay_subscription_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            localStorage.setItem(
              "keshah_rzp_payment",
              JSON.stringify({
                ...response,
                plan: PLAN,
                trial: true,
                trialDays: 1,
              })
            );
          } catch {}
          // Fire Purchase at ₹999 (expected monthly value) so Meta's algo
          // has a real value signal for value-optimization campaigns.
          void trackPurchaseWithCAPI({ value: PRICE_INR, currency: "INR" });
          onClose();
          onPurchaseSuccess();
        },
      });
      rzp.on("payment.failed", () => {
        setErrorMessage("Payment failed. Please try again.");
        setPurchasing(false);
      });

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
      rzp.open();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[TrialInfoPageIndiaPremium] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
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
          You don&apos;t pay anything today.
        </>
      ),
      icon: <UnlockIcon />,
    },
    {
      title: "In 12 hours",
      body: "We'll remind you before your trial ends.",
      icon: <BellIcon />,
    },
    {
      title: "In 24 hours",
      body: "Subscription starts at ₹999/mo. Cancel anytime via your UPI app.",
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
          We want you to try KESHAH
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
          Today, you&apos;ll notice your scalp start to loosen.
          Hair fall generally stops in 60 days.
        </p>

        <div style={{ marginBottom: 32, display: "flex", flexDirection: "column", gap: 0 }}>
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

        <div
          style={{
            borderTop: `1px dashed rgba(255,255,255,0.15)`,
            margin: "4px 0 16px",
          }}
        />

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
            {purchasing ? "Sending you to checkout…" : "Try first day free"}
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
          No payment due today. Cancel anytime via UPI Autopay.
        </p>
      </div>

      {purchasing && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#000",
            zIndex: 200,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "0 32px",
            fontFamily: "Poppins, sans-serif",
          }}
        >
          <div
            style={{
              width: 40,
              height: 40,
              borderRadius: "50%",
              border: "3px solid rgba(255,255,255,0.15)",
              borderTopColor: "#fff",
              animation: "spinTrialIN 800ms linear infinite",
              marginBottom: 24,
            }}
          />
          <div
            style={{
              fontSize: 20,
              fontWeight: 600,
              color: "#fff",
              textAlign: "center",
              marginBottom: 16,
              letterSpacing: "-0.3px",
            }}
          >
            Sending you to UPI verification…
          </div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 500,
              color: "rgba(255,255,255,0.85)",
              textAlign: "center",
              lineHeight: 1.5,
              maxWidth: 360,
            }}
          >
            ₹5 will be charged for verification only.
            <br />
            You will be refunded in a few minutes.
          </div>
          <style jsx>{`
            @keyframes spinTrialIN { to { transform: rotate(360deg); } }
          `}</style>
        </div>
      )}
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
