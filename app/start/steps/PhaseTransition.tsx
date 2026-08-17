"use client";

// Phase transition page between the lifestyle questions and the treatment-
// history section. Hims-style breath/cognitive-chunking moment that frames
// the next phase with PURPOSE so the user feels the quiz is intentional,
// not random. Auto-skips on women.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { mediumHaptic } from "../lib/haptics";
import styles from "../start.module.css";

export default function PhaseTransition() {
  const { answers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isMen = config.audience !== "women" && answers.gender !== "female";

  useEffect(() => {
    if (!isMen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMen]);

  if (!isMen) return null;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div
        className={styles.stepInner}
        style={{ justifyContent: "center", paddingBottom: 64 }}
      >
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.6px",
            margin: 0,
          }}
        >
          Now let&apos;s talk about what you&apos;ve already tried.
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--fg-65)",
            marginTop: 18,
          }}
        >
          Most men have tried at least one treatment before finding KESHAH.
          We want to know what worked, what didn&apos;t, and why — so your
          plan doesn&apos;t repeat the same mistakes.
        </p>
      </div>
      <div className={styles.buttonRow}>
        <Button onClick={handleContinue}>Continue</Button>
      </div>
    </div>
  );
}
