"use client";

/**
 * PlanRevealStep — React port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/plan_reveal.dart
 *
 * Personalized "Your plan is ready" doctor's-note screen. Sits between
 * social proof and the paywall. Reads the user's pinch answer + hair-loss
 * location + gender out of flow-context and echoes them back inside a
 * single YOUR PLAN card: technique-photo strip → numbered prescription →
 * FOLLOW-UP callout dated to today + 3 days → reassurance sign-off.
 *
 * Firestore writes: NONE — this step is a value/personalization anchor
 * only; nothing new needs to hit /api/funnel/save-profile.
 *
 * Animation (mobile 1200ms AnimationController with 5 Interval fades):
 *   - header : 0.00 → 0.25   (0ms   → 300ms)
 *   - system : 0.25 → 0.55   (300ms → 660ms)   [YOUR PLAN card]
 *   - button : 0.50 → 0.80   (600ms → 960ms)   [trust row + sticky CTA]
 * A 100ms delay before the controller starts is preserved so the whole
 * beat lands ~100ms after the page mounts, matching mobile.
 *
 * The mobile source also defines _currentFade (0.12 → 0.4) and
 * _goalFade (0.38 → 0.65) but never wires them into any FadeTransition —
 * they're dead code. We mirror mobile behavior and only wire the three
 * fades that actually drive UI.
 */

import { motion } from "framer-motion";
import { useMemo } from "react";
import { KeshahButton } from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import { colors } from "../lib/tokens";

const FONT = "Poppins, -apple-system, sans-serif";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Framer-motion timings translated from the 1200ms controller.
const EASE_OUT = [0, 0, 0.2, 1] as const;
const INITIAL_DELAY = 0.1;

const HEADER_TRANSITION = {
  duration: 0.3,
  ease: EASE_OUT,
  delay: INITIAL_DELAY + 0.0,
};
const CARD_TRANSITION = {
  duration: 0.36,
  ease: EASE_OUT,
  delay: INITIAL_DELAY + 0.3,
};
const BUTTON_TRANSITION = {
  duration: 0.36,
  ease: EASE_OUT,
  delay: INITIAL_DELAY + 0.6,
};

export default function PlanRevealStep() {
  const { answers, next } = useFlow();
  const gender = answers.gender ?? "male";
  const hairLossLocation = answers.hairLossLocation ?? "";
  // pinchTestAnswer is stashed via PinchTestStep with an `as never` cast — it
  // isn't declared in the QuizAnswers interface. Read it defensively.
  const pinchTestAnswer = (answers as { pinchTestAnswer?: string })
    .pinchTestAnswer;

  // ── Personalization helpers ──────────────────────────────────────────
  const pinchAdjective = useMemo(() => {
    switch (pinchTestAnswer) {
      case "muchTighter":
        return "very tight";
      case "tighter":
        return "tight";
      case "aBitTighter":
        return "a little tight";
      default:
        return "tight";
    }
  }, [pinchTestAnswer]);

  const protocolDiagnosis = `Your scalp is ${pinchAdjective} right now, and that's blocking blood flow to your hair. Here's how we're going to fix it.`;

  const protocolFocusLine = useMemo(() => {
    switch (hairLossLocation) {
      case "crown":
        return "Focus on your crown region";
      case "hairline":
        return gender === "female"
          ? "Focus on your hairline and temples"
          : "Focus on your hairline";
      case "all_over":
        return "Focus on your entire scalp";
      case "part":
        return "Focus on your part";
      default:
        return "Focus on your whole scalp";
    }
  }, [gender, hairLossLocation]);

  const protocolTechniquesLine =
    gender === "female"
      ? "Scalp massages + neck work"
      : "Scalp exercises + neck work";

  const protocolBullets = useMemo(
    () => [
      "Video-guided routine",
      "9 to 17 minutes every day",
      protocolTechniquesLine,
      protocolFocusLine,
      "Message Aadi & team anytime",
    ],
    [protocolFocusLine, protocolTechniquesLine]
  );

  const followUpDateShort = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() + 3);
    const monthAbbr = MONTHS[date.getMonth()].slice(0, 3).toUpperCase();
    return `${monthAbbr} ${date.getDate()}`;
  }, []);

  // Gender-aware technique photo strip. 4 photos for men, 6 for women —
  // matches the mobile plan_reveal.dart strip 1:1 (including filenames).
  const photos =
    gender === "female"
      ? [
          "/start/techniques/technique_scalp_pinching_women.png",
          "/start/techniques/technique_neck_presses.png",
          "/start/techniques/technique_scalp_pressing_women.png",
          "/start/techniques/technique_scalp_stretches_women.png",
          "/start/techniques/technique_acupressure.png",
          "/start/techniques/technique_neck_stretches.png",
        ]
      : [
          "/start/techniques/technique_scalp_pinching.png",
          "/start/techniques/technique_scalp_pressing.png",
          "/start/techniques/technique_scalp_stretches.png",
          "/start/techniques/technique_sliding.png",
        ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        minHeight: 0,
        background: colors.black,
        color: colors.white,
      }}
    >
      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <div
          style={{
            padding: "24px 32px 0",
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          {/* Header — "Your plan is ready" + diagnosis subhead */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={HEADER_TRANSITION}
            style={{ display: "flex", flexDirection: "column" }}
          >
            <h1
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 26,
                fontWeight: 600,
                color: colors.white,
                letterSpacing: -1.2,
                lineHeight: 1.3,
                whiteSpace: "nowrap",
              }}
            >
              Your plan is ready
            </h1>
            <div style={{ height: 12 }} />
            <p
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 15,
                fontWeight: 500,
                color: colors.white,
                lineHeight: 1.4,
              }}
            >
              {protocolDiagnosis}
            </p>
          </motion.div>

          <div style={{ height: 28 }} />

          {/* YOUR PLAN card */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={CARD_TRANSITION}
            style={{
              width: "100%",
              padding: 20,
              boxSizing: "border-box",
              background: "rgba(255,255,255,0.06)",
              borderRadius: 16,
              border: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
            }}
          >
            {/* Technique photo strip — square tiles, 3px horizontal padding
                each, 10px rounded corners. */}
            <div style={{ display: "flex", flexDirection: "row" }}>
              {photos.map((src) => (
                <div
                  key={src}
                  style={{
                    flex: 1,
                    padding: "0 3px",
                    boxSizing: "border-box",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: "1 / 1",
                      borderRadius: 10,
                      overflow: "hidden",
                      background: "rgba(255,255,255,0.04)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={src}
                      alt=""
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: "block",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div style={{ height: 18 }} />

            {/* Numbered protocol steps */}
            {protocolBullets.map((line, i) => (
              <ProtocolStep key={i} number={i + 1} text={line} />
            ))}

            <div style={{ height: 20 }} />

            {/* FOLLOW-UP eyebrow + date */}
            <Eyebrow text={`FOLLOW-UP · ${followUpDateShort}`} />
            <div style={{ height: 8 }} />
            <p
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 14,
                fontWeight: 400,
                color: colors.white,
                lineHeight: 1.45,
                letterSpacing: -0.1,
              }}
            >
              In 3 days, we&apos;ll check if your scalp is starting to get
              looser.
            </p>

            <div style={{ height: 16 }} />
            {/* Divider — sign-off separator */}
            <div
              style={{
                height: 1,
                width: "100%",
                background: "rgba(255,255,255,0.08)",
              }}
            />
            <div style={{ height: 14 }} />

            <p
              style={{
                margin: 0,
                fontFamily: FONT,
                fontSize: 13,
                fontWeight: 400,
                fontStyle: "italic",
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.45,
                letterSpacing: -0.1,
              }}
            >
              No medication, supplements, diet, or lifestyle changes needed.
              Most members see results with the routine alone.
            </p>
          </motion.div>

          <div style={{ height: 28 }} />

          {/* App Store trust footer — small, centered, no hero number */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={BUTTON_TRANSITION}
            style={{
              width: "100%",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                gap: 0,
                maxWidth: "100%",
              }}
            >
              <AppleGlyph color="rgba(255,255,255,0.4)" />
              <div style={{ width: 4 }} />
              {[0, 1, 2, 3].map((i) => (
                <StarFull key={i} color="#FFD700" />
              ))}
              <StarHalf color="#FFD700" />
              <div style={{ width: 6 }} />
              <span
                style={{
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.4)",
                  whiteSpace: "nowrap",
                }}
              >
                4.8 on the App Store · 25,000+ members
              </span>
            </div>
          </motion.div>

          <div style={{ height: 16 }} />
        </div>
      </div>

      {/* Sticky CTA — mobile uses 25px horizontal, 12px top, safe-area bottom */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BUTTON_TRANSITION}
        style={{
          padding: "12px 25px calc(env(safe-area-inset-bottom, 0px) + 16px)",
          boxSizing: "border-box",
        }}
      >
        <KeshahButton
          title="Continue"
          onTap={next}
          expanded
          fontSize={16}
          filled
          style={{ padding: "18px 0" }}
        />
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Building blocks
// ─────────────────────────────────────────────────────────────────────────

function ProtocolStep({ number, text }: { number: number; text: string }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        alignItems: "flex-start",
        padding: "7px 0",
      }}
    >
      <div style={{ width: 22, flexShrink: 0 }}>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 600,
            color: "rgba(255,255,255,0.65)",
            lineHeight: 1.45,
          }}
        >
          {number}.
        </span>
      </div>
      <div style={{ flex: 1 }}>
        <span
          style={{
            fontFamily: FONT,
            fontSize: 14,
            fontWeight: 400,
            color: colors.white,
            lineHeight: 1.45,
            letterSpacing: -0.1,
          }}
        >
          {text}
        </span>
      </div>
    </div>
  );
}

function Eyebrow({ text }: { text: string }) {
  return (
    <span
      style={{
        fontFamily: FONT,
        fontSize: 11,
        fontWeight: 600,
        color: "rgba(255,255,255,0.35)",
        letterSpacing: 1.5,
      }}
    >
      {text}
    </span>
  );
}

// Apple glyph — approximates Icons.apple at ~16px.
function AppleGlyph({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function StarFull({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
    >
      <path d="M12 17.27l6.18 3.73-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function StarHalf({ color }: { color: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
    >
      <path d="M22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27V4.4l2.06 4.87 5.28.45-4.01 3.47 1.2 5.16L12 15.4v1.87l6.18 3.73-1.64-7.03z" />
    </svg>
  );
}
