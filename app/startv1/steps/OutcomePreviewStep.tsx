"use client";

/**
 * OutcomePreviewStep — direct web port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/outcome_preview.dart
 *
 * Sits between PlanReveal and the trial paywall. Answers "and what does
 * that actually look like?" with the app's Day-1 dashboard screenshot
 * and the 60-day promise ("Stop hair loss in 60 days" + target date)
 * as the page header. Gender-aware asset selection.
 *
 * Animation — mirrors the Flutter AnimationController (1200ms, easeOut
 * intervals):
 *   - Header fade  0.0 → 0.3  (0ms   → 360ms)
 *   - Image fade   0.2 → 0.6  (240ms → 720ms)
 *   - CTA fade     0.5 → 0.8  (600ms → 960ms)
 * Mobile also delays controller.forward() by 100ms after mount — we
 * mirror that as a 100ms motion delay applied to every segment.
 *
 * Firestore writes: none. Analytics events on mobile
 * (outcome_preview_viewed / outcome_preview_continue_tapped) are
 * mobile-only Amplitude calls and don't apply on web here.
 */

import { motion } from "framer-motion";
import { useMemo } from "react";
import { useFlow } from "../lib/flow-context";
import { colors, font } from "../lib/tokens";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Flutter uses Curves.easeOut on a CurvedAnimation over each interval.
// Framer-motion cubic-bezier form for easeOut.
const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];

const BASE_DELAY = 0.1; // 100ms Future.delayed before controller.forward()
const CONTROLLER_MS = 1200;

// Convert a Flutter Interval(begin, end) fade to framer-motion delay + duration.
function intervalToMotion(begin: number, end: number) {
  return {
    delay: BASE_DELAY + (begin * CONTROLLER_MS) / 1000,
    duration: ((end - begin) * CONTROLLER_MS) / 1000,
    ease: EASE_OUT,
  };
}

export default function OutcomePreviewStep() {
  const { next, answers } = useFlow();
  const isFemale = answers.gender === "female";

  const targetDate = useMemo(() => {
    const t = new Date();
    t.setDate(t.getDate() + 60);
    return `${MONTHS[t.getMonth()]} ${t.getDate()}`;
  }, []);

  const titleText = isFemale
    ? `Your hair thinning should stop by ${targetDate}.`
    : `Your hair loss should stop by ${targetDate}.`;

  const imageSrc = isFemale
    ? "/start/dashboard_preview_women.png"
    : "/start/dashboard_preview.png";

  const headerFade = intervalToMotion(0.0, 0.3);
  const imageFade = intervalToMotion(0.2, 0.6);
  const ctaFade = intervalToMotion(0.5, 0.8);

  const handleContinue = () => {
    // Mobile fires HapticFeedback.lightImpact + Amplitude event before
    // calling onContinue(). haptic parity is best-effort on web.
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      try { navigator.vibrate?.(10); } catch { /* ignore */ }
    }
    next();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        minHeight: "100dvh",
        width: "100%",
        background: colors.black,
        color: colors.white,
        fontFamily: `${font.family}, -apple-system, sans-serif`,
      }}
    >
      {/* Top spacer — mobile uses MediaQuery.of(context).padding.top + 4.
          On web we use env(safe-area-inset-top) + 4px so notch devices
          match the mobile inset. */}
      <div style={{ height: "calc(env(safe-area-inset-top, 0px) + 4px)" }} />

      {/* Header — padding fromLTRB(32, 40, 32, 0). Fixed at top. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={headerFade}
        style={{
          padding: "40px 32px 0 32px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
        }}
      >
        <h1
          style={{
            fontFamily: `${font.family}, -apple-system, sans-serif`,
            fontSize: 26,
            fontWeight: 600,
            color: colors.white,
            letterSpacing: -1.2,
            lineHeight: 1.3,
            margin: 0,
            textAlign: "left",
          }}
        >
          {titleText}
        </h1>
        <div style={{ height: 12 }} />
        <p
          style={{
            fontFamily: `${font.family}, -apple-system, sans-serif`,
            fontSize: 15,
            fontWeight: 500,
            color: colors.white,
            lineHeight: 1.4,
            margin: 0,
            textAlign: "left",
          }}
        >
          {"Then we'll help you maintain or regrow."}
        </p>
      </motion.div>

      {/* Phone mockup — fills the slack between header and CTA.
          Height-driven sizing: the outer flex-1 container gives us a
          max height; the img uses height:100% + width:auto so the phone
          scales DOWN on shorter viewports instead of overflowing into
          the text above. maxWidth caps it on tall viewports. */}
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 0,
          padding: "16px 0",
          overflow: "hidden",
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={imageFade}
          style={{
            maxWidth: 200,
            maxHeight: "100%",
            borderRadius: 28,
            border: `3px solid rgba(255, 255, 255, 0.12)`,
            boxShadow: [
              "0 0 0 1px rgba(255, 255, 255, 0.06)",
              "0 20px 60px rgba(0, 0, 0, 0.5)",
            ].join(", "),
            overflow: "hidden",
            background: colors.black,
            display: "flex",
          }}
        >
          <div
            style={{
              borderRadius: 25,
              overflow: "hidden",
              display: "flex",
              lineHeight: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageSrc}
              alt="KESHAH Day 1 dashboard preview"
              style={{
                display: "block",
                height: "100%",
                maxHeight: "60vh",
                width: "auto",
                maxWidth: "100%",
                objectFit: "contain",
              }}
            />
          </div>
        </motion.div>
      </div>

      {/* Sticky Continue CTA — padding fromLTRB(25, 12, 25, safeBottom+16). */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={ctaFade}
        style={{
          padding: "12px 25px calc(env(safe-area-inset-bottom, 0px) + 16px) 25px",
        }}
      >
        <button
          type="button"
          onClick={handleContinue}
          style={{
            width: "100%",
            padding: "18px 0",
            background: colors.white,
            color: colors.black,
            border: "none",
            borderRadius: 40,
            fontFamily: `${font.family}, -apple-system, sans-serif`,
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          Continue
        </button>
      </motion.div>
    </div>
  );
}
