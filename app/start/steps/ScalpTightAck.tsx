"use client";

// Socratic Q1 — leads the user to acknowledge their own scalp tightness
// in their own words. Sits AFTER the quiz answers (so they're warmed up)
// and BEFORE the diagnosis reveal (so the diagnosis lands as confirmation
// of their own self-derived hypothesis, not a marketing claim).
//
// Both genders see this. Together with BloodFlowSocratic and
// PersonalizedDiagnosis it forms the closing arc: self-acknowledge →
// self-hypothesize → diagnosis confirms.

import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = ["Yes, definitely", "Sort of", "Not really"];

export default function ScalpTightAck() {
  const { answers, updateAnswers, next, back } = useFlow();
  const selected = answers.scalpTightAck ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ scalpTightAck: label });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          When you pinched your scalp earlier, did it feel tight?
        </h1>
        <p className={styles.subtitle}>
          Be honest with yourself.
        </p>
        <div className={styles.optionList}>
          {OPTIONS.map((label) => {
            const isSelected = selected === label;
            return (
              <button
                key={label}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => handlePick(label)}
              >
                <span>{label}</span>
                <span className={`${styles.optionCheck} ${isSelected ? styles.optionCheckActive : ""}`}>
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.buttonRow}>
        <Button disabled={!selected} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
