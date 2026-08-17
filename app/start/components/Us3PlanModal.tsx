"use client";

// /startus3 plan modal — Monthly $29 vs 3-Month $57 (1 month free badge),
// 3-month default selected with 3-day free trial. Designed for cold Meta
// acquisition: 3-month upfront recovers CAC at conversion, monthly is the
// no-trial fallback for users who want lower commitment.
//
// Uses RevenueCat Web Billing (Stripe under the hood). Same handoff as
// /startus2 — purchase is anonymous at paywall time, SignUp aliases the
// RC customer to the Firebase UID after sign-up so the mobile app sees
// the entitlement on first login.
//
// REQUIRES IN RC DASHBOARD:
//   "3 Months Trial" — $57/3mo with 3-day free trial
// (Monthly reuses the existing $rc_monthly package — same $29 as /start.)

import { useEffect, useState } from "react";
import { fbqTrack, trackPurchaseWithCAPI } from "../lib/fb-pixel";
import { trackCheckoutTikTok, trackPurchaseTikTok } from "../lib/tiktok-pixel";
import { useFunnelConfig } from "../lib/funnel-config";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import {
  isConfigured,
  isUserCancelledError,
  purchasePackage,
  RC_PACKAGE_MONTHLY,
  RC_PACKAGE_3MO,
  RC_PACKAGE_3MO_TRIAL,
} from "../lib/revenuecat";
import { useFlow } from "../lib/flow-context";
import styles from "./plan-modal.module.css";

export type Us3PlanTier = "monthly" | "threeMonthTrial";

interface Props {
  open: boolean;
  onClose: () => void;
  onPurchaseSuccess: (tier: Us3PlanTier) => void;
}

// Map per audience — women's funnels go direct-to-payment on the standard
// 3-month plan ($58, no trial), men's funnels keep the 3-day trial version.
// Resolved at call time inside the component using config.audience.
const TIER_TO_PACKAGE_MEN: Record<Us3PlanTier, string> = {
  monthly: RC_PACKAGE_MONTHLY,
  threeMonthTrial: RC_PACKAGE_3MO_TRIAL,
};
const TIER_TO_PACKAGE_WOMEN: Record<Us3PlanTier, string> = {
  monthly: RC_PACKAGE_MONTHLY,
  threeMonthTrial: RC_PACKAGE_3MO,
};

// Amounts in USD — must match RC dashboard prices. Used for the FB/TT
// Purchase event so ad-spend optimization sees accurate revenue.
const TIER_TO_VALUE_USD: Record<Us3PlanTier, number> = {
  monthly: 29,
  threeMonthTrial: 57,
};

const TIER_TO_NAME_MEN: Record<Us3PlanTier, string> = {
  monthly: "Monthly",
  threeMonthTrial: "3 Months (3-day trial)",
};
const TIER_TO_NAME_WOMEN: Record<Us3PlanTier, string> = {
  monthly: "Monthly",
  threeMonthTrial: "3 Months",
};

export default function Us3PlanModal({ open, onClose, onPurchaseSuccess }: Props) {
  const [selected, setSelected] = useState<Us3PlanTier>("threeMonthTrial");
  const [mounted, setMounted] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Women's funnels swap Aadi's male first-person quote for a neutral
  // women-coded note and hide the photo (we don't have a female founder
  // photo asset). Men's funnels keep Aadi's voice and avatar.
  const config = useFunnelConfig();
  const isWomensFunnel = config.audience === "women";
  const { updateAnswers } = useFlow();

  // Women's funnel: 3 Months is direct-to-payment (no trial). Men's: 3 Months
  // ships the 3-day trial variant. Both share the same Monthly tier.
  const TIER_TO_PACKAGE = isWomensFunnel ? TIER_TO_PACKAGE_WOMEN : TIER_TO_PACKAGE_MEN;
  const TIER_TO_NAME = isWomensFunnel ? TIER_TO_NAME_WOMEN : TIER_TO_NAME_MEN;

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

  const handlePlanTap = (tier: Us3PlanTier) => {
    if (purchasing) return;
    lightHaptic();
    setSelected(tier);
    setErrorMessage(null);
  };

  const handleContinue = async () => {
    if (purchasing) return;
    mediumHaptic();
    setErrorMessage(null);

    const tierName = TIER_TO_NAME[selected];

    fbqTrack("InitiateCheckout", {
      value: TIER_TO_VALUE_USD[selected],
      currency: "USD",
      content_name: tierName,
    });
    void trackCheckoutTikTok({
      value: TIER_TO_VALUE_USD[selected],
      currency: "USD",
      contents: [{
        content_id: selected,
        content_type: "product",
        content_name: tierName,
      }],
    });

    setPurchasing(true);

    const ttContents = [{
      content_id: selected,
      content_type: "product" as const,
      content_name: tierName,
    }];

    if (!isConfigured()) {
      // eslint-disable-next-line no-console
      console.log("[Us3PlanModal] Stub mode — RC not configured", { tier: selected });
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
      // Stash the redemption deep link in flow state so PurchaseSuccess
      // can render the "Open KESHAH" button + QR code. RC returns this
      // via PurchaseResult.redemptionInfo.redeemUrl as a custom-scheme
      // URL (rc-XXX://redeem_web_purchase?...). May be null if the
      // entitlement was already attached to a logged-in App User ID.
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
      console.error("[Us3PlanModal] Purchase failed:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
      setPurchasing(false);
    }
  };

  const threeMonthSelected = selected === "threeMonthTrial";

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
          {/* Monthly — no trial */}
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

          {/* 3 Months — default selected, 3-day trial, 1 month free */}
          <button
            type="button"
            className={`${styles.planCard} ${threeMonthSelected ? styles.planCardSelected : ""}`}
            onClick={() => handlePlanTap("threeMonthTrial")}
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

        {/* Guarantee block — universal 60-day refund offer, gender-aware
            copy. Title flips based on plan selection: 3-month = "Includes
            guarantee", monthly = "Guarantee not included" (and the whole
            block dims via .guaranteeDimmed). The dim teaches the user
            why 3-month is worth picking. */}
        <div className={`${styles.guarantee} ${!threeMonthSelected ? styles.guaranteeDimmed : ""}`}>
          <div className={styles.guaranteeText}>
            <p className={styles.guaranteeTitle}>
              {threeMonthSelected ? "Includes guarantee" : "Guarantee not included"}
            </p>
            <p className={styles.guaranteeBody}>
              If your {isWomensFunnel ? "hair thinning" : "hair loss"}{" "}
              doesn&apos;t reduce in 60 days, reach out to us through chat
              in the app and we&apos;ll refund you.
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
          {purchasing ? (
            <Spinner />
          ) : isWomensFunnel ? (
            // Women's funnel: no-trial direct-to-payment on both tiers.
            "Continue"
          ) : threeMonthSelected ? (
            "Try 3 days for $0.00"
          ) : (
            "Continue"
          )}
        </button>
        <p className={styles.ctaSub}>
          {isWomensFunnel
            ? "Cancel anytime in the app."
            : threeMonthSelected
              ? "No payment due today. Cancel anytime in the app."
              : "Cancel anytime in the app."}
        </p>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="8" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path
        d="M18 10A8 8 0 0 0 10 2"
        stroke="currentColor"
        strokeOpacity="0.85"
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
