"use client";

/**
 * KeshahButton — direct React port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/widget/keshah_button.dart.
 *
 * Visual parity:
 *   - borderRadius: 40 (radius-button token)
 *   - default padding: 15px vertical, 15px horizontal
 *   - filled: kWhite background, kBlack text
 *   - outline: transparent background, kWhite 1px border
 *   - fontWeight: 400 (mobile explicitly uses w400 here)
 *   - Optional forward-arrow icon on the right when `showArrow`
 *   - Loading spinner replaces label
 *   - Press-shrink to 0.98 (matches AnimatedContainer feel)
 *
 * Haptic: mobile calls HapticFeedback.lightImpact on tap indirectly.
 * We fire the shared lightHaptic() to mirror the tactile response the
 * mobile app gives, so web + native feel the same.
 */

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { lightHaptic } from "../../lib/haptics";
import { colors, radius } from "../../lib/tokens";

export interface KeshahButtonProps {
  title?: string;
  onTap?: () => void;
  /** When true, renders a spinner in place of the title and disables tap. */
  loading?: boolean;
  /** Background color of the filled variant. Defaults to kWhite. */
  backgroundColor?: string;
  /** When true, fills the width. Otherwise renders at 70% width like mobile. */
  expanded?: boolean;
  /** When true, appends a forward-arrow icon after the title. */
  showArrow?: boolean;
  /** Absolute pixel width override. Wins over `expanded`. */
  width?: number;
  /** Filled (solid) vs outline (border-only). Defaults to filled. */
  filled?: boolean;
  /** Text/icon color. Defaults to kBlack (matches filled+white bg). */
  color?: string;
  /** Optional leading icon rendered left of the label. */
  icon?: ReactNode;
  /** Font size override — mobile leaves this null which lets Flutter pick 14. */
  fontSize?: number;
  /** Letter spacing override. */
  letterSpacing?: number;
  /** Optional extra widget rendered below the label (subtitle/price). */
  extra?: ReactNode;
  /** Fully custom child — bypasses the built-in label/arrow/extra layout. */
  childOverride?: ReactNode;
  /** Disable tap without going into loading state. */
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function KeshahButton({
  title,
  onTap,
  loading = false,
  backgroundColor = colors.white,
  expanded = false,
  showArrow = false,
  width,
  filled = true,
  color = colors.black,
  icon,
  fontSize,
  letterSpacing,
  extra,
  childOverride,
  disabled = false,
  className,
  style,
}: KeshahButtonProps) {
  const isDisabled = disabled || loading || !onTap;
  const handleClick = () => {
    if (isDisabled) return;
    lightHaptic();
    onTap?.();
  };

  const buttonStyle: CSSProperties = {
    borderRadius: radius.button,
    background: filled ? backgroundColor : "transparent",
    border: filled ? "none" : `1px solid ${colors.white}`,
    color,
    padding: "15px 15px",
    fontFamily: "Poppins, -apple-system, sans-serif",
    fontWeight: 400,
    fontSize: fontSize ?? 14,
    letterSpacing: letterSpacing ?? undefined,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: isDisabled ? "not-allowed" : "pointer",
    width: width ?? "100%",
    transition: "opacity 300ms ease, background 300ms ease",
    opacity: isDisabled && !loading ? 0.5 : 1,
    ...style,
  };

  const inner = (
    <motion.button
      type="button"
      whileTap={isDisabled ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      onClick={handleClick}
      disabled={isDisabled}
      className={className}
      style={buttonStyle}
    >
      {loading ? (
        <Spinner color={filled ? colors.black : colors.white} />
      ) : (
        childOverride ?? (
          <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              {icon}
              <span>{title ?? ""}</span>
              {showArrow && <ArrowForward color={color} />}
            </span>
            {extra ? <span style={{ marginTop: 1 }}>{extra}</span> : null}
          </span>
        )
      )}
    </motion.button>
  );

  // Mobile: when neither expanded nor width is set, wraps in a
  // FractionallySizedBox(widthFactor: 0.7). We mirror that with a
  // max-width container so the button never touches the screen edges
  // unless the caller explicitly opts in.
  if (expanded || width != null) return inner;
  return (
    <div style={{ display: "flex", justifyContent: "center", width: "100%" }}>
      <div style={{ width: "70%" }}>{inner}</div>
    </div>
  );
}

function ArrowForward({ color }: { color: string }) {
  return (
    <svg width="22" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner({ color }: { color: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      style={{ animation: "keshah-spin 700ms linear infinite" }}
    >
      <style>{`@keyframes keshah-spin { to { transform: rotate(360deg); } }`}</style>
      <circle cx="12" cy="12" r="10" stroke={color} strokeOpacity="0.25" strokeWidth="3" />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
