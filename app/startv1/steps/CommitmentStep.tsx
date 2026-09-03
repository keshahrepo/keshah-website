"use client";

/**
 * CommitmentStep — port of the Flutter CommitmentQuestion in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/commitment_question.dart
 *
 * "KESHAH is not a quick fix. Can you commit 20 minutes a day?"
 * Yes → save commitment_answer: 'yes' and advance.
 * No  → soft-exit DisqualificationScreen in place.
 *
 * Animation (1000ms Flutter AnimationController):
 *   - title  fade  0.0 → 0.5  (0ms   → 500ms)
 *   - button fade  0.4 → 1.0  (400ms → 1000ms)
 * Kicked off ~100ms after mount to match the mobile Future.delayed.
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

const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];
const KICKOFF_DELAY = 0.1;

const TITLE_ANIM = {
  duration: 0.5,
  delay: KICKOFF_DELAY,
  ease: EASE_OUT,
};
const BUTTON_ANIM = {
  duration: 0.6,
  delay: KICKOFF_DELAY + 0.4,
  ease: EASE_OUT,
};

export default function CommitmentStep() {
  const { next, updateAnswers } = useFlow();
  const [disqualified, setDisqualified] = useState(false);

  const handleYes = () => {
    lightHaptic();
    updateAnswers({ commitmentAnswer: "yes" });
    next();
  };

  const handleNo = () => {
    lightHaptic();
    setDisqualified(true);
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
        <div style={{ flex: 2 }} />

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
          }}
        >
          KESHAH is not a quick fix. Can you commit 20 minutes a day?
        </motion.h1>

        <div style={{ flex: 3 }} />
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
          Yes, I can commit
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
            No, I can&apos;t
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
          subtext="KESHAH requires a daily commitment to see results."
          onGoBack={() => setDisqualified(false)}
        />
      )}
    </div>
  );
}
