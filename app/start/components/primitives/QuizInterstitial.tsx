"use client";

/**
 * QuizInterstitial — port of `QuizInterstitial` in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/_quiz_widgets.dart:387
 *
 * Layout mirrors mobile exactly:
 *   BackArrowWithAppLogo (logoScale 0.85, no back)
 *   ── flex spacer
 *   TypingReveal(title)           optional
 *   18px gap
 *   TypingReveal(body)
 *   ── flex spacer
 *   Optional "RESEARCH" citation card (fades in after typing done)
 *   Continue button (fades in ~350ms after the citation)
 *
 * Both title + body share the interstitial style: 22px w500,
 * 90% white, tracking -0.4, line-height 1.4 — feels like one spoken
 * thought instead of headline + caption.
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BackArrowWithAppLogo } from "./BackArrowWithAppLogo";
import { KeshahButton } from "./KeshahButton";
import { TypingReveal } from "./TypingReveal";
import { colors } from "../../lib/tokens";

const PER_WORD_MS = 80;
const WORD_FADE_MS = 280;

const interstitialStyle = {
  fontFamily: "Poppins, -apple-system, sans-serif",
  fontSize: 22,
  fontWeight: 500,
  color: "rgba(255, 255, 255, 0.9)",
  letterSpacing: "-0.4px",
  lineHeight: 1.4,
} as const;

export interface QuizInterstitialProps {
  /** Optional hero opener above the body. */
  title?: string;
  body: string;
  /** Muted "RESEARCH" source note rendered above the CTA. */
  footer?: string;
  onComplete: () => void;
  continueLabel?: string;
  onBack?: () => void;
}

export function QuizInterstitial({
  title,
  body,
  footer,
  onComplete,
  continueLabel = "Continue",
  onBack,
}: QuizInterstitialProps) {
  const [showFooter, setShowFooter] = useState(false);
  const [showButton, setShowButton] = useState(false);

  useEffect(() => {
    // Same timing math as the Dart original — compute when the typing
    // reveal finishes so the citation + button land right after.
    const titleWords = title ? title.split(/\s+/).filter(Boolean).length : 0;
    const bodyWords = body.split(/\s+/).filter(Boolean).length;
    const bodyStartMs = title ? 200 + titleWords * PER_WORD_MS + 250 : 300;
    const typingDoneMs = bodyStartMs + bodyWords * PER_WORD_MS + WORD_FADE_MS;

    const footerTimer = window.setTimeout(() => setShowFooter(true), typingDoneMs);
    const buttonTimer = window.setTimeout(() => setShowButton(true), typingDoneMs + 350);
    return () => {
      window.clearTimeout(footerTimer);
      window.clearTimeout(buttonTimer);
    };
  }, [title, body]);

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, width: "100%" }}>
      <BackArrowWithAppLogo logoScale={0.85} isShowBack={Boolean(onBack)} onBack={onBack} />
      <div
        style={{
          flex: 1,
          padding: "0 32px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          minHeight: 0,
          overflowY: "auto",
        }}
      >
        <div style={{ flex: 1 }} />
        {title && (
          <>
            <TypingReveal
              text={title}
              initialDelayMs={200}
              perWordMs={PER_WORD_MS}
              style={interstitialStyle}
            />
            <div style={{ height: 18 }} />
          </>
        )}
        <TypingReveal
          text={body}
          initialDelayMs={
            title
              ? 200 + title.split(/\s+/).filter(Boolean).length * PER_WORD_MS + 250
              : 300
          }
          perWordMs={PER_WORD_MS}
          style={interstitialStyle}
        />
        <div style={{ flex: 2 }} />
      </div>

      {footer && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: showFooter ? 1 : 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          style={{ padding: "0 32px 20px" }}
        >
          <div
            style={{
              width: "100%",
              padding: 14,
              background: "rgba(255, 255, 255, 0.05)",
              borderRadius: 12,
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <div
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 10,
                fontWeight: 600,
                color: "rgba(255, 255, 255, 0.4)",
                letterSpacing: "1.5px",
              }}
            >
              RESEARCH
            </div>
            <div style={{ height: 6 }} />
            <div
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 12,
                fontWeight: 400,
                color: "rgba(255, 255, 255, 0.6)",
                lineHeight: 1.45,
                letterSpacing: "-0.1px",
              }}
            >
              {footer}
            </div>
          </div>
        </motion.div>
      )}

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: showButton ? 1 : 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        style={{ padding: "0 25px 20px", pointerEvents: showButton ? "auto" : "none" }}
      >
        <KeshahButton
          expanded
          title={continueLabel}
          onTap={onComplete}
          backgroundColor={colors.white}
          color={colors.black}
        />
      </motion.div>
    </div>
  );
}
