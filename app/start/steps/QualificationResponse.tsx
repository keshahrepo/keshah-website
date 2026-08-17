"use client";

// Transition beat between Qualification (yes-this-is-for-me) and the
// first quiz question. Confirms the fit, names KESHAH for the first time
// in the funnel as the plan-builder, and sets up the quiz as
// personalization rather than interrogation. Women-only — men's funnel
// keeps the leaner flow and jumps straight to the first question.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function QualificationResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>
          Great, KESHAH scalp massages can help with your thinning hair.
          <br />
          <br />
          Let&apos;s build your plan.
        </p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
