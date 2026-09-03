"use client";

// India TRIAL plan modal — variant of IndiaPlanModal for /startindiafree.
// 3-month plan shows "Includes Free Trial" badge instead of the guarantee.
// CTA opens TrialInfoSheet (1-day) before Razorpay; monthly is direct buy.

import { useEffect, useState } from "react";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { trackPurchaseWithCAPI } from "../lib/fb-pixel";
import styles from "./plan-modal.module.css";
import TrialInfoSheet from "./TrialInfoSheet";

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

export default function IndiaTrialPlanModal({ open, onClose, onPurchaseSuccess }: Props) {
  const [selected, setSelected] = useState<IndiaPlanTier>("threeMonth");
  const [mounted, setMounted] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
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

  const threeMonthSelected = selected === "threeMonth";

  // Primary CTA tap — if trial plan picked, opens the info sheet first;
  // if monthly picked, goes straight to Razorpay (no trial on monthly).
  const handlePrimaryCta = async () => {
    if (purchasing) return;
    mediumHaptic();
    if (threeMonthSelected) {
      setSheetOpen(true);
    } else {
      await openRazorpay(false);
    }
  };

  // Actual Razorpay flow. `trial=true` routes through /api/razorpay/create-order
  // with trialDays:1, which delays the first ₹999 charge by 24 hours.
  const openRazorpay = async (trial: boolean) => {
    setPurchasing(true);
    setErrorMessage(null);

    // Min 5-sec hold so the "Sending to UPI verification" loading view has
    // time to register before Razorpay overlays it.
    const startedAt = Date.now();
    const MIN_LOADING_MS = trial ? 5000 : 0;

    try {
      await loadRazorpayScript();
      const subRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selected,
          trial,
          trialDays: trial ? 1 : undefined,
        }),
      });
      const subData = await subRes.json();
      if (!subData.ok) throw new Error(subData.error || "Subscription creation failed");

      const description = trial
        ? "1-day free trial · ₹999 every 3 months after"
        : selected === "monthly"
        ? "Monthly subscription — ₹499/month"
        : "3-month subscription — ₹999 every 3 months";

      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY,
        subscription_id: subData.subscriptionId,
        name: "KESHAH",
        description,
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
                plan: selected,
                trial,
                trialDays: trial ? 1 : undefined,
              })
            );
          } catch {}
          void trackPurchaseWithCAPI({
            // Zero CAPI value for trial — the real purchase fires on Day 7
            // webhook. Non-trial reports full plan value at auth.
            value: trial ? 0 : TIER_TO_VALUE_INR[selected],
            currency: "INR",
          });
          setSheetOpen(false);
          onClose();
          onPurchaseSuccess(selected);
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
      setSheetOpen(false);
      rzp.open();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[IndiaTrialPlanModal] error:", err);
      setErrorMessage(err instanceof Error ? err.message : "Something went wrong");
      setPurchasing(false);
    }
  };

  if (!open) return null;

  const ctaLabel = purchasing
    ? "Processing…"
    : threeMonthSelected
    ? "Try first day free"
    : "Subscribe — ₹499/mo";

  return (
    <>
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
            {/* Monthly — on top, no trial option */}
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
                  Cancel anytime
                </span>
              </div>
              <div className={styles.planRight} style={{ marginLeft: 8 }}>
                <div className={styles.planPriceRow}>
                  <span className={`${styles.planPrice} ${!threeMonthSelected ? styles.planPriceActive : ""}`}>₹499<span className={styles.planPriceSuffix}>/mo</span></span>
                </div>
              </div>
            </button>

            {/* 3 months — default selected, trial badge replaces guarantee */}
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
                  <span>Includes free trial</span>
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

          {errorMessage && <div className={styles.errorMessage}>{errorMessage}</div>}

          <button
            type="button"
            className={`${styles.cta} ${purchasing ? styles.ctaLoading : ""}`}
            onClick={handlePrimaryCta}
            disabled={purchasing}
          >
            {ctaLabel}
          </button>
          <p className={styles.ctaSub}>
            Cancel anytime from your UPI app&apos;s Autopay settings.
          </p>
        </div>
      </div>

      <TrialInfoSheet
        open={sheetOpen}
        onClose={() => {
          if (!purchasing) setSheetOpen(false);
        }}
        onConfirm={() => openRazorpay(true)}
        busy={purchasing}
        trialDays={1}
      />
    </>
  );
}
