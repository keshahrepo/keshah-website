"use client";

import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { HairGoal as HairGoalId } from "../lib/types";

const OPTIONS: { id: HairGoalId; label: string }[] = [
  { id: "stop_the_loss", label: "Stop the loss" },
  { id: "regrow_hair", label: "Regrow hair" },
  { id: "both", label: "Both" },
];

export default function HairGoal() {
  const { answers, updateAnswers, next, back } = useFlow();

  // Single flow for all users — matches mobile source of truth. No gender
  // branching; every user sees the same 3-option single-select picker and
  // writes to `hairGoal` (single string).
  const selected = answers.hairGoal;
  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>What&apos;s your goal?</h1>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => {
                  lightHaptic();
                  updateAnswers({ hairGoal: opt.id });
                }}
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
        <Button disabled={!selected} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
