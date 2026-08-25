"use client";

/**
 * HairLossLocationStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hair_loss_location_page.dart
 *
 * Gender-aware single-select:
 *   men   → crown / hairline / all_over
 *   women → part / hairline / all_over  (with women-specific labels)
 *
 * Mobile animation: single 1000ms AnimationController with three intervals —
 *   title  fade 0.0–0.4 easeOut
 *   list   fade 0.2–0.7 easeOut
 *   button fade 0.5–1.0 easeOut
 * Starts after a 100ms post-mount delay.
 *
 * Firestore field: writes `hairLossLocation` (id: "crown" | "hairline" |
 * "all_over" | "part") into flow answers — the shared save-profile route
 * persists it into `hair_loss_location` (see save-profile/route.ts line 198)
 * which is the exact mobile field.
 */

import { motion } from "framer-motion";
import { BackArrowWithAppLogo } from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import { lightHaptic } from "../lib/haptics";
import { colors, radius } from "../lib/tokens";
import type { HairLossLocation } from "../lib/types";

interface LocationOption {
  id: HairLossLocation;
  title: string;
}

const MEN_OPTIONS: LocationOption[] = [
  { id: "crown", title: "Crown" },
  { id: "hairline", title: "Hairline" },
  { id: "all_over", title: "All over" },
];

const WOMEN_OPTIONS: LocationOption[] = [
  { id: "part", title: "Widening part" },
  { id: "hairline", title: "Around my hairline / temples" },
  { id: "all_over", title: "Overall thinning" },
];

// Mirror Flutter's CurvedAnimation(Interval(begin, end, easeOut)) inside a
// 1000ms parent controller. framer-motion duration is the parent length; the
// per-child delay + duration reproduce the interval, and easeOut = [0,0,0.2,1].
const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];
const START_DELAY = 0.1; // matches Flutter's 100ms Future.delayed before forward()

// title  interval 0.0–0.4 of 1000ms → delay 0ms,   duration 400ms
// list   interval 0.2–0.7 of 1000ms → delay 200ms, duration 500ms
// button interval 0.5–1.0 of 1000ms → delay 500ms, duration 500ms
const titleFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.4, delay: START_DELAY + 0.0, ease: EASE_OUT } },
};
const listFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.5, delay: START_DELAY + 0.2, ease: EASE_OUT } },
};
const buttonFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.5, delay: START_DELAY + 0.5, ease: EASE_OUT } },
};

export default function HairLossLocationStep() {
  const { answers, updateAnswers, next } = useFlow();
  const options = answers.gender === "female" ? WOMEN_OPTIONS : MEN_OPTIONS;
  const selected = answers.hairLossLocation ?? null;

  const handleSelect = (id: HairLossLocation) => {
    lightHaptic();
    updateAnswers({ hairLossLocation: id });
  };

  const handleContinue = () => {
    if (!selected) return;
    lightHaptic();
    next();
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: "100dvh",
        width: "100%",
      }}
    >
      {/* Mobile: BackArrowWithAppLogo(logoScale: 0.85, isShowBack: false). */}
      <BackArrowWithAppLogo logoScale={0.85} isShowBack={false} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "0 32px",
          minHeight: 0,
        }}
      >
        {/* Spacer(flex: 1) */}
        <div style={{ flex: 1 }} />

        <motion.h1
          variants={titleFade}
          initial="initial"
          animate="animate"
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
          {"Where are you\nlosing hair?"}
        </motion.h1>

        <div style={{ height: 32 }} />

        <motion.div variants={listFade} initial="initial" animate="animate">
          {options.map((option) => {
            const isSelected = selected === option.id;
            return (
              <div key={option.id} style={{ paddingBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => handleSelect(option.id)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    padding: "16px 20px",
                    borderRadius: 14,
                    border: `${isSelected ? 1.5 : 1}px solid ${
                      isSelected ? colors.white : "rgba(255,255,255,0.15)"
                    }`,
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "border-color 150ms ease",
                  }}
                >
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "Poppins, -apple-system, sans-serif",
                      fontSize: 15,
                      fontWeight: 500,
                      color: isSelected ? colors.white : "rgba(255,255,255,0.5)",
                    }}
                  >
                    {option.title}
                  </span>
                  {isSelected && (
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      style={{ marginLeft: 12 }}
                    >
                      <path
                        d="M5 12L10 17L19 8"
                        stroke={colors.white}
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </button>
              </div>
            );
          })}
        </motion.div>

        {/* Spacer(flex: 2) */}
        <div style={{ flex: 2 }} />
      </div>

      {/* Bottom-anchored Continue pill — mobile: 25 horizontal / 35 bottom
          padding, 18 vertical inner, radius 40, 200ms tween between live
          (kWhite bg + kBlack label) and disabled (30% white + 50% white). */}
      <motion.div
        variants={buttonFade}
        initial="initial"
        animate="animate"
        style={{ padding: "0 25px 35px 25px" }}
      >
        <button
          type="button"
          disabled={!selected}
          onClick={handleContinue}
          style={{
            width: "100%",
            padding: "18px 0",
            border: "none",
            borderRadius: radius.button,
            background: selected ? colors.white : "rgba(255,255,255,0.3)",
            color: selected ? colors.black : "rgba(255,255,255,0.5)",
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            cursor: selected ? "pointer" : "not-allowed",
            transition: "background 200ms ease, color 200ms ease",
          }}
        >
          Continue
        </button>
      </motion.div>
    </div>
  );
}
