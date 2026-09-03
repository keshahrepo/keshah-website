"use client";

/**
 * TitleTextWidget — direct port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/widget/title_widgets.dart.
 *
 * Thin styled <span> that mirrors the mobile widget's Text (fontFamily
 * Poppins, configurable size / weight / color / letter spacing). Kept
 * as a primitive so step components can render body copy with the same
 * API as Flutter.
 */

import type { CSSProperties, ReactNode } from "react";
import { colors } from "../../lib/tokens";

export interface TitleTextWidgetProps {
  text: string | ReactNode;
  size: number;
  weight: 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;
  textColor?: string;
  letterSpacing?: number;
  lineHeight?: number;
  as?: "span" | "p" | "h1" | "h2" | "h3" | "h4";
  className?: string;
  style?: CSSProperties;
}

export function TitleTextWidget({
  text,
  size,
  weight,
  textColor = colors.white,
  letterSpacing,
  lineHeight,
  as: Tag = "span",
  className,
  style,
}: TitleTextWidgetProps) {
  return (
    <Tag
      className={className}
      style={{
        fontFamily: "Poppins, -apple-system, sans-serif",
        fontSize: size,
        fontWeight: weight,
        color: textColor,
        letterSpacing: letterSpacing ?? undefined,
        lineHeight: lineHeight ?? undefined,
        ...style,
      }}
    >
      {text}
    </Tag>
  );
}
