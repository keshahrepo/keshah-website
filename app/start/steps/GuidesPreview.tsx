"use client";

// Swipeable preview of the 5 KESHAH guides bundled with the trial.
// Shows full-size cover images so the production quality registers — the
// covers look like a real publication, and the paywall's 44px thumbnails
// don't do them justice. Three pages now share guide-reveal duty:
//
//   1. GuidesPreview  → anticipatory tease, full-size covers swipeable
//   2. TrialPaywall   → "PLUS 5 FREE GUIDES · $95 VALUE" with cross-out pricing
//   3. Us3TrialInfo   → worst-case/best-case close referencing the $95 anchor
//
// Auto-skips on non-Us3 funnels (India, /startfree, legacy /start) since
// they don't include the guide bundle.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import startStyles from "../start.module.css";

// Audience-aware cover lists — mirror the women's set on women's funnels
// (/mandy, /f/jennifer, /f/donna) and the men's set everywhere else.
const GUIDES_MEN = [
  "/start/guides/KESHAH_Men_Guide_01_Method.png",
  "/start/guides/KESHAH_Men_Guide_02_Vitamins.png",
  "/start/guides/KESHAH_Men_Guide_03_Shampoo.png",
  "/start/guides/KESHAH_Men_Guide_04_Dandruff.png",
  "/start/guides/KESHAH_Men_Guide_05_Dermaroller.png",
];
const GUIDES_WOMEN = [
  "/start/guides/KESHAH_Women_Guide_01_Method.png",
  "/start/guides/KESHAH_Women_Guide_02_Styling.png",
  "/start/guides/KESHAH_Women_Guide_03_Vitamins.png",
  "/start/guides/KESHAH_Women_Guide_04_Shampoo.png",
  "/start/guides/KESHAH_Women_Guide_05_Dandruff.png",
];

export default function GuidesPreview() {
  const { next } = useFlow();
  const config = useFunnelConfig();

  // Only Us3-pricing funnels include the guide bundle. Other funnels skip.
  const skip = config.pricing !== "us3";

  const GUIDES = config.audience === "women" ? GUIDES_WOMEN : GUIDES_MEN;

  useEffect(() => {
    if (skip) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  if (skip) return null;

  const isLight = config.theme === "light";
  const CARD_BG = isLight ? "#fff" : "rgba(255,255,255,0.04)";
  const CARD_BORDER = isLight ? "rgba(26,26,26,0.10)" : "rgba(255,255,255,0.10)";

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={startStyles.stepBody}>
      <div
        style={{
          padding: "calc(env(safe-area-inset-top) + 56px) 24px 0",
          textAlign: "center",
          flexShrink: 0,
        }}
      >
        <h1
          className={startStyles.headline}
          style={{
            margin: "8px auto 0",
            fontSize: 24,
            textAlign: "center",
            maxWidth: 340,
          }}
        >
          We&apos;ve also included 5 guides in your plan.
        </h1>
        <p
          style={{
            margin: "10px auto 0",
            padding: 0,
            fontSize: 15,
            lineHeight: 1.4,
            textAlign: "center",
            color: isLight ? "rgba(26,26,26,0.7)" : "rgba(255,255,255,0.7)",
            maxWidth: 320,
            fontWeight: 500,
            fontFamily: "Poppins, -apple-system, sans-serif",
          }}
        >
          Everything else you need to know, beyond your daily routine.
        </p>
      </div>

      {/* Swipeable carousel — extends to viewport edges so the cards can
          peek in/out as the user flicks. First/last cards have side padding
          so they can snap fully into view. */}
      <div
        style={{
          display: "flex",
          gap: 12,
          overflowX: "auto",
          scrollSnapType: "x mandatory",
          WebkitOverflowScrolling: "touch",
          paddingLeft: 24,
          paddingRight: 24,
          paddingTop: 16,
          paddingBottom: 24,
        }}
      >
        {GUIDES.map((src) => (
          <div
            key={src}
            style={{
              flex: "0 0 auto",
              width: "min(78vw, 320px)",
              aspectRatio: "8.5 / 11",
              borderRadius: 12,
              overflow: "hidden",
              background: CARD_BG,
              border: `1px solid ${CARD_BORDER}`,
              scrollSnapAlign: "center",
              position: "relative",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
            />
          </div>
        ))}
      </div>

      <div className={startStyles.buttonRow}>
        <button type="button" className={startStyles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
