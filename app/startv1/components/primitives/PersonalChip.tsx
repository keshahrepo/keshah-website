"use client";

/**
 * PersonalChip — small pill used to echo a user's quiz answer back at
 * them ("You told us: 35-44"). Mobile pattern uses a subtle bordered
 * pill with the neutral text color at full opacity and a hairline
 * white/15% border, sitting on the app's kBlack background.
 *
 * Not a 1:1 port of any single Flutter widget — it's the repeated
 * inline-styled Container used across the personalization interstitials
 * (HairLossLocationResponse / TreatmentsResponse / GoalResponse) — this
 * primitive gives step agents a single import to reach for.
 */

import type { CSSProperties, ReactNode } from "react";
import { colors } from "../../lib/tokens";

export interface PersonalChipProps {
  children: ReactNode;
  /** Optional leading icon rendered left of the label. */
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function PersonalChip({ children, icon, className, style }: PersonalChipProps) {
  return (
    <span
      className={className}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 14px",
        borderRadius: 999,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: colors.white,
        fontFamily: "Poppins, -apple-system, sans-serif",
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "-0.1px",
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon}
      {children}
    </span>
  );
}
