"use client";

// Top header for quiz screens — small centered KESHAH logo and optional
// back arrow. Mirrors BackArrowWithAppLogo from title_widgets.dart.
// Logo variant chosen by theme: dark theme → white logo, light theme →
// black logo. Without this, the white logo disappears on women's cream bg.
import { useFunnelConfig } from "../lib/funnel-config";
import { lightHaptic } from "../lib/haptics";
import styles from "./step-header.module.css";

interface Props {
  /** When provided, shows a back arrow on the left that calls this. */
  onBack?: () => void;
}

export default function StepHeader({ onBack }: Props) {
  const config = useFunnelConfig();
  const handleBack = () => {
    lightHaptic();
    onBack?.();
  };

  // Light theme (women) needs the black logo; dark theme keeps the
  // existing logo (which is light-colored, was the original wordmark).
  const logoSrc =
    config.theme === "light" ? "/images/keshah-logo-black.png" : "/images/logo.png";

  return (
    <div className={styles.header}>
      {onBack && (
        <button
          type="button"
          aria-label="Go back"
          className={styles.backBtn}
          onClick={handleBack}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
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

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={logoSrc}
        alt="KESHAH"
        width={60}
        height={40}
        fetchPriority="high"
        className={styles.logo}
        // The base CSS applies `filter: brightness(0) invert(1)` to flip
        // the black source logo to white for the men's dark theme. On the
        // women's light theme we want the logo to render in its native
        // black, so we override the filter inline.
        style={config.theme === "light" ? { filter: "none" } : undefined}
      />
    </div>
  );
}
