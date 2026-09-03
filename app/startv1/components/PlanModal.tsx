"use client";

// US / International plan modal — mirrors IndiaPlanModal's 2-card design.
//
// Pricing: Monthly $29 (no guarantee) vs 3-Month $58 (= ~$19/mo effective,
// 33% off, default selected, includes Aadi's Guarantee). The guarantee
// gate on Monthly is the primary lever pushing users to the 3-month plan.
//
// Uses RevenueCat Web Billing (Stripe under the hood). The purchase is
// anonymous at paywall time; SignUp aliases the RC customer to the
// Firebase UID after sign-up so the mobile app sees the entitlement on
// first login.

import { useEffect, useState } from "react";
import { fbqTrack, trackPurchaseWithCAPI } from "../lib/fb-pixel";
import { trackCheckoutTikTok, trackPurchaseTikTok } from "../lib/tiktok-pixel";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import {
  isConfigured,
  isUserCancelledError,
  purchasePackage,
  RC_PACKAGE_MONTHLY,
  RC_PACKAGE_3MO,
} from "../lib/revenuecat";
import { useFlow } from "../lib/flow-context";
import styles from "./plan-modal.module.css";

export type PlanTier = "monthly" | "threeMonth" | "annual";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Called after a successful purchase (or in stub mode after the user
   *  taps Continue). The parent should navigate to the success step. */
  onPurchaseSuccess: (tier: PlanTier) => void;
}

const TIER_TO_PACKAGE: Record<PlanTier, string> = {
  monthly: RC_PACKAGE_MONTHLY,
  threeMonth: RC_PACKAGE_3MO,
  annual: "$rc_annual",
};

// Amounts in USD — must match RC dashboard prices. Used for the Facebook
// Purchase event so ad-spend optimization sees accurate revenue.
const TIER_TO_VALUE_USD: Record<PlanTier, number> = {
  monthly: 29,
  threeMonth: 57,
  annual: 99,
};

export default function PlanModal({ open, onClose, onPurchaseSuccess }: Props) {
  const [selected, setSelected] = useState<PlanTier>("threeMonth");
  const [mounted, setMounted] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { updateAnswers } = useFlow();

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setMounted(true));
    } else {
      setMounted(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const handleBackdropClick = () => {
    if (purchasing) return;
    lightHaptic();
    onClose();
  };

  const handleSheetClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handlePlanTap = (tier: PlanTier) => {
    if (purchasing) return;
    lightHaptic();
    setSelected(tier);
    setErrorMessage(null);
  };

  const handleContinue = async () => {
    if (purchasing) return;
    mediumHaptic();
    setErrorMessage(null);

    fbqTrack("InitiateCheckout", {
      value: TIER_TO_VALUE_USD[selected],
      currency: "USD",
      content_name: selected === "threeMonth" ? "3 months" : "1 month",
    });
    void trackCheckoutTikTok({
      value: TIER_TO_VALUE_USD[selected],
      currency: "USD",
      contents: [{
        content_id: selected,
        content_type: "product",
        content_name: selected === "threeMonth" ? "3 months" : "1 month",
      }],
    });

    setPurchasing(true);

    // Stub mode: RC API key not set — useful for local testing the rest
    // of the funnel without going through the real checkout.
    const ttContents = [{
      content_id: selected,
      content_type: "product" as const,
      content_name: selected === "threeMonth" ? "3 months" : "1 month",
    }];

    if (!isConfigured()) {
      // eslint-disable-next-line no-console
      console.log("[PlanModal] Stub mode — RC not configured", { tier: selected });
      void trackPurchaseWithCAPI({
        value: TIER_TO_VALUE_USD[selected],
        currency: "USD",
      });
      void trackPurchaseTikTok({
        value: TIER_TO_VALUE_USD[selected],
        currency: "USD",
        contents: ttContents,
      });
      setPurchasing(false);
      onClose();
      onPurchaseSuccess(selected);
      return;
    }

    try {
      const packageId = TIER_TO_PACKAGE[selected];
      const result = await purchasePackage(packageId);
      if (!result) {
        throw new Error("Purchase returned no result");
      }
      // See Us3PlanModal — stash the redemption deep link for PurchaseSuccess.
      const redeemUrl = result.redemptionInfo?.redeemUrl ?? undefined;
      if (redeemUrl) updateAnswers({ rcRedeemUrl: redeemUrl });
      void trackPurchaseWithCAPI({
        value: TIER_TO_VALUE_USD[selected],
        currency: "USD",
      });
      void trackPurchaseTikTok({
        value: TIER_TO_VALUE_USD[selected],
        currency: "USD",
        contents: ttContents,
      });
      onClose();
      onPurchaseSuccess(selected);
    } catch (err) {
      const cancelled = await isUserCancelledError(err);
      if (cancelled) {
        setPurchasing(false);
        return;
      }
      // eslint-disable-next-line no-console
      console.error("[PlanModal] Purchase failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setPurchasing(false);
    }
  };

  const threeMonthSelected = selected === "threeMonth";

  return (
    <div
      className={`${styles.overlay} ${mounted ? styles.overlayOpen : ""}`}
      onClick={handleBackdropClick}
    >
      <div
        className={`${styles.sheet} ${mounted ? styles.sheetOpen : ""}`}
        onClick={handleSheetClick}
      >
        <div className={styles.handle} />
        <h2 className={styles.headline}>Choose your plan</h2>

        <div className={styles.plans}>
          {/* Monthly — on top, no guarantee */}
          <button
            type="button"
            className={`${styles.planCard} ${!threeMonthSelected ? styles.planCardSelected : ""}`}
            onClick={() => handlePlanTap("monthly")}
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
                <span className={`${styles.planPrice} ${!threeMonthSelected ? styles.planPriceActive : ""}`}>
                  $29<span className={styles.planPriceSuffix}>/mo</span>
                </span>
              </div>
            </div>
          </button>

          {/* 3 Months — recommended, default selected, guarantee included */}
          <button
            type="button"
            className={`${styles.planCard} ${threeMonthSelected ? styles.planCardSelected : ""}`}
            onClick={() => handlePlanTap("threeMonth")}
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
                <span className={styles.planStrikethrough} style={{ marginRight: 4 }}>$29</span>
                <span className={`${styles.planPrice} ${threeMonthSelected ? styles.planPriceActive : ""}`}>
                  $19<span className={styles.planPriceSuffix}>/mo</span>
                </span>
              </div>
              <div className={styles.planBilled} style={{ marginTop: 4, whiteSpace: "nowrap" }}>
                $57 every 3mo
              </div>
            </div>
          </button>
        </div>

        {/* Aadi's Guarantee — dimmed when Monthly is selected */}
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
              &ldquo;Complete 60 days in the app. If your hair fall doesn&apos;t
              stop, message me and I&apos;ll personally make sure you get a
              refund.&rdquo;
            </p>
          </div>
        </div>

        {errorMessage && <p className={styles.errorMessage}>{errorMessage}</p>}

        <button
          type="button"
          className={`${styles.cta} ${purchasing ? styles.ctaLoading : ""}`}
          onClick={handleContinue}
          disabled={purchasing}
        >
          {purchasing ? <Spinner /> : "Continue"}
        </button>
        <p className={styles.ctaSub}>Cancel anytime.</p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="rgba(0,0,0,0.2)" strokeWidth="2" />
      <path
        d="M18 10A8 8 0 0 0 10 2"
        stroke="rgba(0,0,0,0.85)"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 10 10"
          to="360 10 10"
          dur="0.8s"
          repeatCount="indefinite"
        />
      </path>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
      <path
        d="M2 6L5 9L10 3"
        stroke="#4CAF50"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
