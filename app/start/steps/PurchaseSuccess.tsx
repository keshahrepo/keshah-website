"use client";

// Post-purchase success page — RC hosted page parity. Just the essentials:
// check + headline + App Store / Play Store badges + Redeem purchase button.
// No subheads, no labels, no fallback copy. Match RC's layout 1:1.

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useFlow } from "../lib/flow-context";
import StepHeader from "../components/StepHeader";
import styles from "./purchase-success.module.css";

const IOS_LINK = "https://apps.apple.com/app/id6450676544";
const ANDROID_LINK =
  "https://play.google.com/store/apps/details?id=com.keshahapp.hair";

function detectMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
}

export default function PurchaseSuccess() {
  const { answers } = useFlow();
  const redeemUrl = answers.rcRedeemUrl;

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    setIsMobile(detectMobile());
  }, []);

  return (
    <div className={styles.root}>
      <StepHeader />
      <div className={styles.body}>
        <div className={styles.checkBubble}>
          <CheckIcon />
        </div>
        <h1 className={styles.headline}>Congratulations!</h1>
        <p className={styles.subhead}>
          You now have access to your treatment plan.
        </p>

        <div className={styles.stepLabel}>
          <span className={styles.stepBadge}>1</span>
          Install the app
        </div>
        <div className={styles.storeButtons}>
          <a href={IOS_LINK} className={styles.storeBadge} rel="noopener">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://tools.applemediaservices.com/api/badges/download-on-the-app-store/white/en-us?size=250x83"
              alt="Download on the App Store"
              width={170}
              height={56}
            />
          </a>
          <a href={ANDROID_LINK} className={styles.storeBadge} rel="noopener">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg"
              alt="Get it on Google Play"
              width={170}
              height={56}
            />
          </a>
        </div>

        {redeemUrl && (
          <>
            <div className={styles.stepLabel}>
              <span className={styles.stepBadge}>2</span>
              Redeem your purchase
            </div>
            {isMobile ? (
              <a href={redeemUrl} className={styles.redeemButton}>
                Redeem purchase
              </a>
            ) : (
              <div className={styles.qrCard}>
                <QRCodeSVG
                  value={redeemUrl}
                  size={160}
                  level="M"
                  bgColor="#ffffff"
                  fgColor="#000000"
                  includeMargin={false}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <path
        d="M6 16L13 23L26 9"
        stroke="#359033"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
