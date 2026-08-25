"use client";

/**
 * BackArrowWithAppLogo — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/widget/title_widgets.dart.
 *
 * A top-of-screen bar with an optional back chevron on the left and the
 * KESHAH wordmark centered. Matches mobile's `BackArrowWithAppLogo`:
 *   - kToolbarHeight (56px) tall when forceHeight is true
 *   - Logo width 130px, scaled by `logoScale`
 *   - Back button padding-left 8px, 20px icon
 *
 * Theme handling: dark theme uses the white wordmark, light theme
 * uses the black wordmark (matches StepHeader's existing behavior so we
 * don't wash out on cream backgrounds).
 */

import type { ReactNode } from "react";
import { lightHaptic } from "../../lib/haptics";

// funnel-config module was deleted; dark theme is the only surviving
// path through the scratch-rebuild flow, so the light-theme branches
// were pruned here rather than kept behind a hardcoded constant.

export interface BackArrowWithAppLogoProps {
  /** Whether the back chevron is rendered. Defaults to false. */
  isShowBack?: boolean;
  onBack?: () => void;
  /** Optional widget rendered flush left of the logo. */
  leading?: ReactNode;
  /** Optional widget rendered flush right of the logo. */
  trailing?: ReactNode;
  /** Multiplier applied to the logo — mobile onboarding uses 0.85. */
  logoScale?: number;
  /** Force the 56px toolbar height. Defaults to true. */
  forceHeight?: boolean;
}

const LOGO_WIDTH = 130;
const TOOLBAR_HEIGHT = 56;

export function BackArrowWithAppLogo({
  isShowBack = false,
  onBack,
  leading,
  trailing,
  logoScale = 1,
  forceHeight = true,
}: BackArrowWithAppLogoProps) {
  const logoSrc = "/images/logo.png";

  const handleBack = () => {
    lightHaptic();
    onBack?.();
  };

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: forceHeight ? TOOLBAR_HEIGHT : undefined,
        paddingTop: 8,
        display: "flex",
        alignItems: "center",
      }}
    >
      {leading && (
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
          {leading}
        </div>
      )}

      {isShowBack && (
        <button
          type="button"
          aria-label="Go back"
          onClick={handleBack}
          style={{
            position: "absolute",
            left: 8,
            top: "50%",
            transform: "translateY(-50%)",
            width: 40,
            height: 40,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
            color: "#FFFFFF",
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15 18L9 12L15 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}

      <div style={{ margin: "0 auto", display: "flex", justifyContent: "center", width: "100%" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt="KESHAH"
          width={LOGO_WIDTH}
          height={40}
          style={{
            width: LOGO_WIDTH * logoScale,
            height: "auto",
            filter: undefined,
          }}
        />
      </div>

      {trailing && (
        <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
          {trailing}
        </div>
      )}
    </div>
  );
}
