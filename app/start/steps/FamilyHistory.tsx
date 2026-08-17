"use client";

// Men's family history question with the under-question "Why we ask" box —
// builds clinical credibility mid-quiz by naming hereditary hair loss as
// the most common cause. Hims-style trust escalation.
//
// Auto-skips on women (whose triggerContext step covers genetic/hormonal
// context with their own naming taxonomy).

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = ["Yes", "No", "Not sure"];

export default function FamilyHistory() {
  const { answers, updateAnswers, next, back } = useFlow();
  // Renders for both genders — genetics matter for women's pattern thinning
  // too. Hers asks every quiz-taker the same question.
  void useFunnelConfig();

  const selected = answers.familyHistory ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ familyHistory: label });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>Does hair loss run in your family?</h1>
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
