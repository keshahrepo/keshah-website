"use client";

/**
 * PageHeader — standard title + optional subtitle wrapper, matching the
 * `_quizTitleStyle` / `_quizSubtitleStyle` block used across
 * _quiz_widgets.dart. Wrapped in AnimatedPageItem so it participates
 * in the parent AnimatedPage stagger (title comes in first, then list,
 * then button).
 *
 * Title  → 28px, w600, tracking -1.2px, line-height 1.25
 * Subtitle → 14px, w400, muted 60% white, line-height 1.4
 */

import type { CSSProperties } from "react";
import { AnimatedPageItem } from "./AnimatedPage";
import { colors } from "../../lib/tokens";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  align?: "left" | "center";
  className?: string;
  style?: CSSProperties;
}

export function PageHeader({
  title,
  subtitle,
  align = "left",
  className,
  style,
}: PageHeaderProps) {
  return (
    <AnimatedPageItem className={className} style={{ textAlign: align, ...style }}>
      <h1
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 28,
          fontWeight: 600,
          color: colors.white,
          letterSpacing: -1.2,
          lineHeight: 1.25,
          margin: 0,
          whiteSpace: "pre-line",
        }}
      >
        {title}
      </h1>
      {subtitle && (
        <p
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 14,
            fontWeight: 400,
            color: "rgba(255, 255, 255, 0.6)",
            lineHeight: 1.4,
            marginTop: 12,
            whiteSpace: "pre-line",
          }}
        >
          {subtitle}
        </p>
      )}
    </AnimatedPageItem>
  );
}
