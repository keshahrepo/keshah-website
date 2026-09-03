"use client";

// /startindia3 — single-tier paid-traffic paywall.
// Hypothesis: cold paid traffic converts higher with one clear option than
// with the weekly/monthly decoy. Big headline → before/after → one price →
// guarantee → one CTA. Goal: 5-second decision, lowest possible friction.

import { useEffect, useState } from "react";
import { mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";
import styles from "./plan-modal.module.css";

export type IndiaSinglePlanTier = "monthlyV2";

interface Props {
  open: boolean;
  onClose: () => void;
  onPurchaseSuccess: (tier: IndiaSinglePlanTier) => void;
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;
const PRICE_INR = 396;

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

export default function IndiaSinglePlanModal({ open, onClose, onPurchaseSuccess }: Props) {
  const [mounted, setMounted] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setMounted(true));
      loadRazorpayScript().catch(() => {});
    } else {
      setMounted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const handleStart = async () => {
    if (purchasing) return;
    mediumHaptic();
    setPurchasing(true);
    setErrorMessage(null);

    try {
      await loadRazorpayScript();
      const subRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "monthlyV2" }),
      });
      const subData = await subRes.json();
      if (!subData.ok) throw new Error(subData.error || "Subscription creation failed");

      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY,
        subscription_id: subData.subscriptionId,
        name: "KESHAH",
        description: "1-Month Plan — ₹396/month (₹99/week)",
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
              JSON.stringify({ ...response, plan: "monthlyV2" })
            );
          } catch {}
          void trackPurchaseWithCAPI({
            value: PRICE_INR,
            currency: "INR",
          });
          onClose();
          onPurchaseSuccess("monthlyV2");
        },
      });
      rzp.on("payment.failed", () => {
        setErrorMessage("Payment failed. Please try again.");
        setPurchasing(false);
      });
      rzp.open();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[IndiaSinglePlanModal] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setPurchasing(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className={`${styles.overlay} ${mounted ? styles.overlayOpen : ""}`}
      onClick={onClose}
    >
      <div
        className={`${styles.sheet} ${mounted ? styles.sheetOpen : ""}`}
        onClick={(e) => e.stopPropagation()}
        style={{ padding: "0 0 calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className={styles.handle} />

        {/* Headline + outcome subhead */}
        <div style={{ padding: "0 25px", textAlign: "center", marginBottom: 18 }}>
          <h2
            style={{
              fontSize: 26,
              fontWeight: 700,
              color: "#fff",
              letterSpacing: "-0.6px",
              lineHeight: 1.2,
              margin: 0,
            }}
          >
            Stop hair fall in 60 days
          </h2>
          <p
            style={{
              fontSize: 14,
              fontWeight: 500,
              color: "rgba(255,255,255,0.65)",
              lineHeight: 1.4,
              margin: "8px 0 0",
            }}
          >
            Without drugs, surgeries, or side effects.
          </p>
        </div>

        {/* Before/after proof strip */}
        <div style={{ padding: "0 25px", marginBottom: 18 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/aadi-progression.jpeg"
            alt="Day 0, Day 90, Day 150 hairline progression"
            onError={(e) => {
              // Hide if image not yet uploaded — paywall still works
              (e.target as HTMLImageElement).style.display = "none";
            }}
            style={{
              width: "100%",
              height: "auto",
              borderRadius: 12,
              display: "block",
            }}
          />
        </div>

        {/* Single pricing card */}
        <div style={{ padding: "0 25px", marginBottom: 16 }}>
          <div
            style={{
              border: "2px solid #4CAF50",
              borderRadius: 16,
              background: "rgba(76,175,80,0.06)",
              padding: 20,
              textAlign: "center",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: "#4CAF50",
                letterSpacing: 0.8,
                textTransform: "uppercase",
                marginBottom: 6,
              }}
            >
              1-Month Plan
            </div>
            <div style={{ display: "flex", alignItems: "baseline", justifyContent: "center", gap: 4 }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: "#fff", letterSpacing: "-1px" }}>
                ₹99
              </span>
              <span style={{ fontSize: 18, fontWeight: 500, color: "rgba(255,255,255,0.7)" }}>
                /week
              </span>
            </div>
            <div
              style={{
                fontSize: 13,
                color: "rgba(255,255,255,0.55)",
                marginTop: 4,
              }}
            >
              Billed ₹396/month. Cancel anytime.
            </div>
          </div>
        </div>

        {/* Guarantee — compact founder-style */}
        <div
          style={{
            margin: "0 25px 18px",
            padding: 14,
            background: "rgba(255,255,255,0.04)",
            borderRadius: 12,
            display: "flex",
            gap: 12,
            alignItems: "flex-start",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/aadi.png"
            alt="Aadi"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            style={{
              width: 38,
              height: 38,
              borderRadius: "50%",
              objectFit: "cover",
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
              Aadi&apos;s Guarantee
            </div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.45 }}>
              Complete 60 days. If your hair fall doesn&apos;t stop, message me
              and I&apos;ll personally make sure you get a refund.
            </div>
          </div>
        </div>

        {errorMessage && (
          <div style={{ color: "#ff6b6b", fontSize: 13, textAlign: "center", padding: "0 25px", marginBottom: 8 }}>
            {errorMessage}
          </div>
        )}

        {/* Single CTA */}
        <div style={{ padding: "0 25px" }}>
          <button
            type="button"
            onClick={handleStart}
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
              fontFamily: "inherit",
              cursor: purchasing ? "default" : "pointer",
              opacity: purchasing ? 0.6 : 1,
              WebkitTapHighlightColor: "transparent",
              outline: "none",
              lineHeight: "20px",
            }}
          >
            {purchasing ? "Sending you to checkout…" : "Start now"}
          </button>
          <p
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "rgba(255,255,255,0.45)",
              textAlign: "center",
              lineHeight: 1.5,
              margin: "10px 0 0",
            }}
          >
            Cancel anytime from your UPI app&apos;s Autopay settings.
          </p>
        </div>
      </div>
    </div>
  );
}
