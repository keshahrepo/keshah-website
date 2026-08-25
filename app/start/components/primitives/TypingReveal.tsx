"use client";

/**
 * TypingReveal — port of `TypingReveal` in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/_quiz_widgets.dart:714
 *
 * Word-by-word fade + slide-up reveal — reads like the sentence is
 * being spoken. Preserves paragraph breaks on `\n\n` (extra vertical
 * gap between paragraphs but the animation timeline stays continuous).
 *
 *   initialDelayMs → delay before first word
 *   perWordMs      → stagger between word starts (default 80)
 *   _fadeMs (280)  → per-word fade duration
 */

import { motion } from "framer-motion";
import type { CSSProperties } from "react";

const FADE_MS = 280;

export interface TypingRevealProps {
  text: string;
  initialDelayMs?: number;
  perWordMs?: number;
  /** Style applied to each word — set the font/size/color here. */
  style?: CSSProperties;
  className?: string;
  /** Fires when the last word finishes fading in. */
  onComplete?: () => void;
}

export function TypingReveal({
  text,
  initialDelayMs = 200,
  perWordMs = 80,
  style,
  className,
  onComplete,
}: TypingRevealProps) {
  const paragraphs = text
    .split("\n\n")
    .map((p) => p.split(/\s+/).filter(Boolean))
    .filter((p) => p.length > 0);

  // Running word index → continuous timeline across paragraph breaks.
  let wordIndex = 0;
  const totalWords = paragraphs.reduce((sum, p) => sum + p.length, 0);

  return (
    <div className={className} style={{ display: "flex", flexDirection: "column" }}>
      {paragraphs.map((words, p) => (
        <div
          key={p}
          style={{
            marginTop: p === 0 ? 0 : 16,
            display: "flex",
            flexWrap: "wrap",
          }}
        >
          {words.map((word, i) => {
            const delay = (initialDelayMs + wordIndex * perWordMs) / 1000;
            const isLast = wordIndex === totalWords - 1;
            wordIndex += 1;
            return (
              <motion.span
                key={`${p}-${i}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: FADE_MS / 1000, delay, ease: "easeOut" }}
                onAnimationComplete={isLast ? onComplete : undefined}
                style={{
                  display: "inline-block",
                  whiteSpace: "pre",
                  ...style,
                }}
              >
                {word + (i < words.length - 1 ? " " : "")}
              </motion.span>
            );
          })}
        </div>
      ))}
    </div>
  );
}
