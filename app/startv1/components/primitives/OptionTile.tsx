"use client";

/**
 * OptionTile — the tappable card used by QuizSinglePick and
 * QuizMultiPick. Matches `_OptionTile` in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/_quiz_widgets.dart:615
 *
 *   - padding: 20px horizontal, 16px vertical
 *   - borderRadius: 14
 *   - border: white 15% (1px) unselected → white 100% (1.5px) selected
 *   - label: 15px, w500, white 50% unselected → white 100% selected
 *   - trailing check icon when selected
 *   - 12px bottom margin
 *   - light haptic on tap
 */

import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { lightHaptic } from "../../lib/haptics";
import { colors } from "../../lib/tokens";

export interface OptionTileProps {
  label: string;
  isSelected: boolean;
  onTap: () => void;
  /** Optional leading element (icon, emoji). Rendered left of label. */
  leading?: ReactNode;
  /** Optional trailing element that replaces the built-in check. */
  trailing?: ReactNode;
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function OptionTile({
  label,
  isSelected,
  onTap,
  leading,
  trailing,
  disabled = false,
  className,
  style,
}: OptionTileProps) {
  const handleClick = () => {
    if (disabled) return;
    lightHaptic();
    onTap();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      className={className}
      style={{
        marginBottom: 12,
        padding: "16px 20px",
        borderRadius: 14,
        border: `${isSelected ? 1.5 : 1}px solid ${isSelected ? colors.white : "rgba(255,255,255,0.15)"}`,
        background: "transparent",
        color: isSelected ? colors.white : "rgba(255,255,255,0.5)",
        fontFamily: "Poppins, -apple-system, sans-serif",
        fontSize: 15,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        width: "100%",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        textAlign: "left",
        transition: "color 180ms ease, border-color 180ms ease",
        ...style,
      }}
    >
      {leading && <span style={{ marginRight: 12, display: "flex" }}>{leading}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      {trailing !== undefined
        ? trailing
        : isSelected && (
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              style={{ marginLeft: 12, flexShrink: 0 }}
            >
              <path
                d="M20 6L9 17l-5-5"
                stroke={colors.white}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
    </motion.button>
  );
}
