"use client";

// India plan modal — full-featured version matching the app's india_plan_modal.dart,
// with inline style overrides for mobile density.

import { useEffect, useState } from "react";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";
import styles from "./plan-modal.module.css";

const TIER_TO_VALUE_INR: Record<IndiaPlanTier, number> = {
  monthly: 499,
  threeMonth: 999,
};

export type IndiaPlanTier = "monthly" | "threeMonth";

interface Props {
  open: boolean;
  onClose: () => void;
  onPurchaseSuccess: (tier: IndiaPlanTier) => void;
}

const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

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

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path d="M2 6L5 9L10 3" stroke="#4CAF50" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function IndiaPlanModal({ open, onClose, onPurchaseSuccess }: Props) {
  const [selected, setSelected] = useState<IndiaPlanTier>("threeMonth");
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

  const handleContinue = async () => {
    if (purchasing) return;
    mediumHaptic();
    setPurchasing(true);
    setErrorMessage(null);

    try {
      await loadRazorpayScript();
      const subRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selected }),
      });
      const subData = await subRes.json();
      if (!subData.ok) throw new Error(subData.error || "Subscription creation failed");

      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY,
        subscription_id: subData.subscriptionId,
        name: "KESHAH",
        description:
          selected === "monthly"
            ? "Monthly subscription — ₹499/month"
            : "3-month subscription — ₹999 every 3 months",
        theme: { color: "#000000" },
        modal: { ondismiss: () => { setPurchasing(false); } },
        handler: (response: {
          razorpay_subscription_id: string;
          razorpay_payment_id: string;
          razorpay_signature: string;
        }) => {
          try {
            localStorage.setItem("keshah_rzp_payment", JSON.stringify({ ...response, plan: selected }));
          } catch {}
          void trackPurchaseWithCAPI({
            value: TIER_TO_VALUE_INR[selected],
            currency: "INR",
          });
          onClose();
          onPurchaseSuccess(selected);
        },
      });
      rzp.on("payment.failed", () => {
        setErrorMessage("Payment failed. Please try again.");
        setPurchasing(false);
      });
      rzp.open();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[IndiaPlanModal] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setPurchasing(false);
    }
  };

  if (!open) return null;

  const threeMonthSelected = selected === "threeMonth";

  return (
    <div
      className={`${styles.overlay} ${mounted ? styles.overlayOpen : ""}`}
      onClick={onClose}
    >
      <div
        className={`${styles.sheet} ${mounted ? styles.sheetOpen : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.handle} />
        <h2 className={styles.headline}>Choose your plan</h2>

        <div className={styles.plans}>
          {/* Monthly — on top */}
          <button
            type="button"
            className={`${styles.planCard} ${!threeMonthSelected ? styles.planCardSelected : ""}`}
            onClick={() => { lightHaptic(); setSelected("monthly"); }}
            style={{ padding: 20 }}
          >
            <div className={styles.planLeft}>
              <div className={styles.planLabelRow}>
                <span className={`${styles.planLabel} ${!threeMonthSelected ? styles.planLabelActive : ""}`}>
                  Monthly
                </span>
              </div>
              <span className={styles.planSubtitleMuted} style={{ marginTop: 5 }}>
                No guarantee
              </span>
            </div>
            <div className={styles.planRight} style={{ marginLeft: 8 }}>
              <div className={styles.planPriceRow}>
                <span className={`${styles.planPrice} ${!threeMonthSelected ? styles.planPriceActive : ""}`}>₹499<span className={styles.planPriceSuffix}>/mo</span></span>
              </div>
            </div>
          </button>

          {/* 3 months — recommended, default selected */}
          <button
            type="button"
            className={`${styles.planCard} ${threeMonthSelected ? styles.planCardSelected : ""}`}
            onClick={() => { lightHaptic(); setSelected("threeMonth"); }}
            style={{ padding: 20 }}
          >
            <div className={styles.planLeft}>
              <div className={styles.planLabelRow} style={{ flexWrap: "nowrap" }}>
                <span className={`${styles.planLabel} ${threeMonthSelected ? styles.planLabelActive : ""}`}>
                  3 Months
                </span>
                <span className={styles.popularBadge} style={{ whiteSpace: "nowrap", fontSize: 8 }}>
                  1 MONTH FREE
                </span>
              </div>
              <span className={styles.planSubtitleMuted} style={{ marginTop: 5 }}>
                Stop hair loss + keep it
              </span>
              <div className={styles.planSubtitleGreen} style={{ marginTop: 4 }}>
                <CheckIcon />
                <span>Includes guarantee</span>
              </div>
            </div>
            <div className={styles.planRight} style={{ marginLeft: 8 }}>
              <div className={styles.planPriceRow}>
                <span className={styles.planStrikethrough} style={{ marginRight: 4 }}>₹499</span>
                <span className={`${styles.planPrice} ${threeMonthSelected ? styles.planPriceActive : ""}`}>₹333<span className={styles.planPriceSuffix}>/mo</span></span>
              </div>
              <div className={styles.planBilled} style={{ marginTop: 4, whiteSpace: "nowrap" }}>
                ₹999 every 3mo
              </div>
            </div>
          </button>
        </div>

        {/* Aadi's Guarantee — dimmed when monthly */}
        <div className={`${styles.guarantee} ${!threeMonthSelected ? styles.guaranteeDimmed : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/aadi.png"
            alt="Aadi"
            className={styles.guaranteeAvatar}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className={styles.guaranteeText}>
            <p className={styles.guaranteeTitle}>
              {threeMonthSelected ? "Aadi's Guarantee" : "Aadi's Guarantee — not included"}
            </p>
            <p className={styles.guaranteeBody}>
              &quot;Complete 60 days in the app. If your hair fall doesn&apos;t stop,
              message me and I&apos;ll personally make sure you get a refund.&quot;
            </p>
          </div>
        </div>

        {errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}

        <button
          type="button"
          className={`${styles.cta} ${purchasing ? styles.ctaLoading : ""}`}
          onClick={handleContinue}
          disabled={purchasing}
        >
          {purchasing ? "Processing…" : "Continue"}
        </button>
        <p className={styles.ctaSub}>
          Cancel anytime from your UPI app&apos;s Autopay settings.
        </p>
      </div>
    </div>
  );
}
