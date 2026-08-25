"use client";

/**
 * QualificationStep — port of the Flutter QualificationScreen in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/qualification_screen.dart
 *
 * "Is KESHAH right for you?" — a two-column list (for / not for) that
 * gender-branches its "for" copy (women get postpartum / perimenopause /
 * menopause / stress rows; men get androgenic / MPB / stress). Answering
 * Yes advances the funnel; answering No shows a soft-exit
 * DisqualificationScreen in-place with a "Go back" pill that lets the
 * user reconsider.
 *
 * Animation (mirrors the 1000ms Flutter AnimationController):
 *   - title  fade  0.0 -> 0.4  (0ms  -> 400ms)
 *   - list   fade  0.2 -> 0.7  (200ms -> 700ms)
 *   - button fade  0.5 -> 1.0  (500ms -> 1000ms)
 * Kicked off ~100ms after mount to match the mobile Future.delayed.
 *
 * No Firestore write on this step — it is a branching gate only. The
 * mobile screen writes nothing and only calls onYes/onNo.
 */

import { motion } from "framer-motion";
import { useState } from "react";
import {
  BackArrowWithAppLogo,
  DisqualificationScreen,
} from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import { lightHaptic } from "../lib/haptics";
import { colors } from "../lib/tokens";

const MEN_FOR_ITEMS = [
  "Genetic hair loss",
  "Androgenic alopecia",
  "Male pattern baldness",
  "Stress-related hair loss",
];

const WOMEN_FOR_ITEMS = [
  "Female pattern hair thinning",
  "Genetic / androgenetic alopecia",
  "Postpartum shedding",
  "Perimenopause hair loss",
  "Menopause hair loss",
  "Stress-related shedding",
];

const NOT_FOR_ITEMS = [
  "Alopecia areata (patchy)",
  "Chemotherapy-related",
  "Scarring alopecia",
];

const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];
const KICKOFF_DELAY = 0.1; // 100ms

// Framer timings translated from Flutter Interval(begin, end) fractions of
// a 1000ms parent. duration = (end - begin) * 1s; delay = begin * 1s + kickoff.
const TITLE_ANIM = {
  duration: 0.4,
  delay: KICKOFF_DELAY,
  ease: EASE_OUT,
};
const LIST_ANIM = {
  duration: 0.5,
  delay: KICKOFF_DELAY + 0.2,
  ease: EASE_OUT,
};
const BUTTON_ANIM = {
  duration: 0.5,
  delay: KICKOFF_DELAY + 0.5,
  ease: EASE_OUT,
};

function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M5 12.5L10 17.5L19 7.5"
        stroke="#4ADE80"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 6L18 18M18 6L6 18"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface RowProps {
  icon: React.ReactNode;
  label: string;
  muted?: boolean;
}

function ListRow({ icon, label, muted }: RowProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        paddingBottom: 10,
      }}
    >
      <div style={{ paddingTop: 2, lineHeight: 0 }}>{icon}</div>
      <span
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 15,
          fontWeight: 400,
          color: muted ? "rgba(255,255,255,0.35)" : colors.white,
          flex: 1,
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function QualificationStep() {
  const { answers, next } = useFlow();
  const [disqualified, setDisqualified] = useState(false);

  const gender = answers.gender ?? "male";
  const forItems = gender === "female" ? WOMEN_FOR_ITEMS : MEN_FOR_ITEMS;

  const handleYes = () => {
    lightHaptic();
    next();
  };

  const handleNo = () => {
    lightHaptic();
    setDisqualified(true);
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: "Poppins, -apple-system, sans-serif",
    fontSize: 14,
    fontWeight: 500,
    color: "rgba(255,255,255,0.5)",
    margin: 0,
    marginBottom: 12,
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100%",
        flex: 1,
      }}
    >
      <BackArrowWithAppLogo isShowBack={false} logoScale={0.85} />

      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          padding: "0 32px",
        }}
      >
        <div style={{ flex: 1 }} />

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={TITLE_ANIM}
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 28,
            fontWeight: 600,
            color: colors.white,
            letterSpacing: "-1.2px",
            lineHeight: 1.25,
            margin: 0,
            whiteSpace: "pre-line",
          }}
        >
          {"Is KESHAH right\nfor you?"}
        </motion.h1>

        <div style={{ height: 32 }} />

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={LIST_ANIM}
          style={{ display: "flex", flexDirection: "column" }}
        >
          <p style={sectionLabelStyle}>KESHAH is for:</p>
          {forItems.map((item) => (
            <ListRow key={item} icon={<CheckIcon />} label={item} />
          ))}

          <div style={{ height: 24 }} />

          <p style={sectionLabelStyle}>KESHAH is NOT for:</p>
          {NOT_FOR_ITEMS.map((item) => (
            <ListRow key={item} icon={<CloseIcon />} label={item} muted />
          ))}
        </motion.div>

        <div style={{ flex: 2 }} />
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BUTTON_ANIM}
        style={{ padding: "0 25px 35px" }}
      >
        <button
          type="button"
          onClick={handleYes}
          style={{
            width: "100%",
            padding: "18px 0",
            borderRadius: 40,
            border: "none",
            background: colors.white,
            color: colors.black,
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          KESHAH is right for me
        </button>

        <div style={{ height: 12 }} />

        <button
          type="button"
          onClick={handleNo}
          style={{
            width: "100%",
            padding: "14px 0",
            borderRadius: 40,
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.2)",
            color: colors.white,
            fontFamily: "Poppins, -apple-system, sans-serif",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 2,
          }}
        >
          <span
            style={{
              fontSize: 16,
              fontWeight: 500,
              color: "rgba(255,255,255,0.6)",
            }}
          >
            Not right for me
          </span>
          <span
            style={{
              fontSize: 11,
              fontWeight: 400,
              color: "rgba(255,255,255,0.25)",
            }}
          >
            KESHAH may not be the right fit for you
          </span>
        </button>
      </motion.div>

      {disqualified && (
        <DisqualificationScreen
          message="KESHAH might not be the right fit for you right now."
          subtext="Unfortunately, KESHAH is designed for genetic hair loss patterns."
          onGoBack={() => setDisqualified(false)}
        />
      )}
    </div>
  );
}
