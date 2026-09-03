"use client";

// /startindia2 pricing test — weekly (decoy) vs monthly (winner + guarantee).
// Mirrors IndiaPlanModal structure and styles.

import { useEffect, useState } from "react";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";
import styles from "./plan-modal.module.css";

const TIER_TO_VALUE_INR: Record<India2PlanTier, number> = {
  weeklyPremium: 499,
  monthlyPremium996: 996,
};

export type India2PlanTier = "weeklyPremium" | "monthlyPremium996";

interface Props {
  open: boolean;
  onClose: () => void;
  onPurchaseSuccess: (tier: India2PlanTier) => void;
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

export default function India2PlanModal({ open, onClose, onPurchaseSuccess }: Props) {
  const [selected, setSelected] = useState<India2PlanTier>("monthlyPremium996");
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
          selected === "weeklyPremium"
            ? "Weekly Plan — ₹499, billed weekly"
            : "Monthly Plan — ₹996/month (₹249/week)",
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
      console.error("[India2PlanModal] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setPurchasing(false);
    }
  };

  if (!open) return null;

  const monthlySelected = selected === "monthlyPremium996";

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
          {/* Weekly — decoy, on top */}
          <button
            type="button"
            className={`${styles.planCard} ${!monthlySelected ? styles.planCardSelected : ""}`}
            onClick={() => { lightHaptic(); setSelected("weeklyPremium"); }}
            style={{ padding: 20 }}
          >
            <div className={styles.planLeft}>
              <div className={styles.planLabelRow}>
                <span className={`${styles.planLabel} ${!monthlySelected ? styles.planLabelActive : ""}`}>
                  Weekly Plan
                </span>
              </div>
              <span className={styles.planSubtitleMuted} style={{ marginTop: 5 }}>
                No guarantee
              </span>
            </div>
            <div className={styles.planRight} style={{ marginLeft: 8 }}>
              <div className={styles.planPriceRow}>
                <span className={`${styles.planPrice} ${!monthlySelected ? styles.planPriceActive : ""}`}>₹499<span className={styles.planPriceSuffix}>/wk</span></span>
              </div>
            </div>
          </button>

          {/* Monthly — recommended, default selected */}
          <button
            type="button"
            className={`${styles.planCard} ${monthlySelected ? styles.planCardSelected : ""}`}
            onClick={() => { lightHaptic(); setSelected("monthlyPremium996"); }}
            style={{ padding: 20 }}
          >
            <div className={styles.planLeft}>
              <div className={styles.planLabelRow} style={{ flexWrap: "nowrap" }}>
                <span className={`${styles.planLabel} ${monthlySelected ? styles.planLabelActive : ""}`}>
                  Monthly Plan
                </span>
                <span className={styles.popularBadge} style={{ whiteSpace: "nowrap", fontSize: 8 }}>
                  SAVE 50%
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
                <span className={`${styles.planPrice} ${monthlySelected ? styles.planPriceActive : ""}`}>₹249<span className={styles.planPriceSuffix}>/wk</span></span>
              </div>
              <div className={styles.planBilled} style={{ marginTop: 4, whiteSpace: "nowrap" }}>
                Billed ₹996/mo.
              </div>
            </div>
          </button>
        </div>

        {/* Aadi's Guarantee — dimmed when weekly */}
        <div className={`${styles.guarantee} ${!monthlySelected ? styles.guaranteeDimmed : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/aadi.png"
            alt="Aadi"
            className={styles.guaranteeAvatar}
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
          <div className={styles.guaranteeText}>
            <p className={styles.guaranteeTitle}>
              {monthlySelected ? "Aadi's Guarantee" : "Aadi's Guarantee — not included"}
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
