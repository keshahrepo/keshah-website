"use client";

// Men's belief question — do you think stress is contributing to your hair
// loss? Self-diagnosis / attribution, not a frequency scale. Trust escalation
// moment paired with the under-question educational box naming telogen
// effluvium — most men have heard "stress causes hair loss" but never seen
// the medical term, so naming it here positions KESHAH as the people who
// actually know what's happening.
//
// Auto-skips on women (men-only beat per mobile source of truth).
// "No" answer skips the stressFrequencyResponse interstitial — if the user
// doesn't think stress is the cause, the cortisol-mechanism explainer isn't
// relevant to them.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = [
  { id: "yes", label: "Yes" },
  { id: "maybe", label: "Maybe" },
  { id: "no", label: "No" },
];

export default function StressFrequency() {
  const { answers, updateAnswers, next, goTo, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (isWomen) return null;

  const selected = answers.stressFrequency ?? "";

  const handlePick = (id: string) => {
    lightHaptic();
    updateAnswers({ stressFrequency: id });
  };

  const handleContinue = () => {
    // "No" — user doesn't think stress is contributing. Skip past the
    // cortisol-mechanism interstitial straight to the next question.
    if (selected === "no") {
      goTo("recentStressEvent");
      return;
    }
    next();
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          Do you feel that stress could be contributing to your hair loss?
        </h1>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => handlePick(opt.id)}
              >
                <span>{opt.label}</span>
                <span className={`${styles.optionCheck} ${isSelected ? styles.optionCheckActive : ""}`}>
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.buttonRow}>
        <Button disabled={!selected} onClick={handleContinue}>
          Continue
        </Button>
      </div>
    </div>
  );
}
