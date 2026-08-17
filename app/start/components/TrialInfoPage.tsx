"use client";

// Full-screen trial info page shown on /startindiafree in place of the
// plan modal + bottom sheet. Apple-style layout (Calm/Noom/Duolingo
// pattern) that explains the trial timeline before Razorpay.
//
// Trial-only: no monthly plan shown here — /startindiafree isolates the
// trial variable for A/B comparison against /startindia.

import { useEffect, useState } from "react";
import { mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";

interface Props {
  onClose: () => void;
  onPurchaseSuccess: () => void;
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

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

export default function TrialInfoPage({ onClose, onPurchaseSuccess }: Props) {
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // Prefetch Razorpay SDK so it's ready when CTA fires.
    loadRazorpayScript().catch(() => {});
    // Lock body scroll while this page is mounted.
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

    // Min 5-sec hold so the "Sending to UPI verification" state registers
    // visually before Razorpay overlays the page.
    const startedAt = Date.now();
    const MIN_LOADING_MS = 5000;

    try {
      await loadRazorpayScript();
      const subRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: "threeMonth",
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
        description: "1-day free trial · ₹999 every 3 months after",
        theme: { color: "#000000" },
        modal: {
          ondismiss: () => {
            setPurchasing(false);
          },
        },
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
                plan: "threeMonth",
                trial: true,
                trialDays: 1,
              })
            );
          } catch {}
          // CAPI fires 0 on trial start — real purchase event fires from
          // the server-side webhook when the Day 1 charge lands.
          void trackPurchaseWithCAPI({ value: 0, currency: "INR" });
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
      console.error("[TrialInfoPage] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setPurchasing(false);
    }
  };

  const steps = [
    {
      title: "Today",
      body: (
        <>
          Unlock full access for free.
          <br />
          You don&apos;t have to pay anything.
        </>
      ),
    },
    {
      title: "Later today",
      body: "We'll WhatsApp you before your trial ends tomorrow.",
    },
    {
      title: "Tomorrow",
      body: "Subscription starts. You can cancel easily before this date.",
    },
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        zIndex: 100,
        display: "flex",
        flexDirection: "column",
        fontFamily: "Poppins, -apple-system, sans-serif",
        color: "#fff",
      }}
    >
      {/* Header with back */}
      <div
        style={{
          padding: "20px 20px 0",
          display: "flex",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          onClick={purchasing ? undefined : onClose}
          disabled={purchasing}
          aria-label="Back"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            background: "rgba(255,255,255,0.06)",
            border: "none",
            color: "#fff",
            cursor: purchasing ? "default" : "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            opacity: purchasing ? 0.4 : 1,
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      </div>

      {/* Scrollable body */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "32px 28px 20px",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Headline */}
        <h1
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.8px",
            lineHeight: 1.2,
            margin: 0,
            marginBottom: 36,
          }}
        >
          How does trial work?
        </h1>

        {/* Timeline — Apple-style green filled dots with white checkmarks
            on active steps, outlined dot on the future step. */}
        <div style={{ marginBottom: 32, display: "flex", flexDirection: "column" }}>
          {steps.map((s, i) => {
            const isActive = i < 2;
            const isLast = i === steps.length - 1;
            return (
              <div key={s.title} style={{ display: "flex", alignItems: "stretch" }}>
                {/* Dot column */}
                <div
                  style={{
                    width: 32,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                  }}
                >
                  {/* Dot */}
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      background: isActive ? "#4CAF50" : "transparent",
                      border: isActive ? "none" : "1.5px solid rgba(255,255,255,0.25)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      marginTop: 2,
                    }}
                  >
                    {isActive && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path
                          d="M3 7.5L5.5 10L11 4"
                          stroke="#fff"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  {/* Connector line */}
                  {!isLast && (
                    <div
                      style={{
                        flex: 1,
                        width: 1.5,
                        background: "rgba(255,255,255,0.15)",
                        marginTop: 4,
                        marginBottom: 4,
                      }}
                    />
                  )}
                </div>
                {/* Text column */}
                <div
                  style={{
                    flex: 1,
                    paddingLeft: 14,
                    paddingBottom: isLast ? 0 : 24,
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "#fff",
                      lineHeight: 1.3,
                    }}
                  >
                    {s.title}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 400,
                      color: "rgba(255,255,255,0.6)",
                      lineHeight: 1.5,
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

        <div style={{ flex: 1 }} />

        {/* Subscription terms */}
        <p
          style={{
            fontSize: 13,
            color: "rgba(255,255,255,0.5)",
            textAlign: "center",
            lineHeight: 1.5,
            margin: "12px 0 20px",
          }}
        >
          Subscription starts at ₹999 every 3 months.
          <br />
          Cancel anytime.
        </p>

        {errorMessage && (
          <p
            style={{
              color: "#ff6b6b",
              fontSize: 13,
              textAlign: "center",
              marginBottom: 12,
            }}
          >
            {errorMessage}
          </p>
        )}
      </div>

      {/* Sticky CTA */}
      <div
        style={{
          padding: "0 20px calc(env(safe-area-inset-bottom) + 20px)",
          background: "#000",
        }}
      >
        <button
          type="button"
          onClick={handleStartTrial}
          disabled={purchasing}
          style={{
            width: "100%",
            padding: "18px 0",
            background: "#fff",
            color: "#000",
            fontSize: 16,
            fontWeight: 600,
            border: "none",
            borderRadius: 40,
            fontFamily: "Poppins, sans-serif",
            cursor: purchasing ? "default" : "pointer",
            opacity: purchasing ? 0.5 : 1,
            transition: "opacity 0.2s",
          }}
        >
          {purchasing ? "Sending you to UPI verification…" : "Try first day free"}
        </button>
      </div>
    </div>
  );
}
