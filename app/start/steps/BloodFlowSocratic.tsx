"use client";

// Socratic Q2 — leads the user to derive the mechanism themselves. After
// they've acknowledged their scalp is tight, asking whether tightness
// might be reducing blood flow to follicles puts the THEORY in their own
// mouth. By the time PersonalizedDiagnosis loads, the diagnosis is
// confirming what they already concluded — not telling them something new.
// Self-derived insight = stronger commitment than any marketing claim.

import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = [
  "Yes, that makes sense",
  "Maybe — I'm not sure",
  "I don't know",
];

export default function BloodFlowSocratic() {
  const { answers, updateAnswers, next, back } = useFlow();
  const selected = answers.bloodFlowSocratic ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ bloodFlowSocratic: label });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          If your scalp is tight, do you think the small blood vessels under
          it could be getting squeezed shut?
        </h1>
        <p className={styles.subtitle}>
          And if your hair grows from those vessels — what would that do
          to your hair?
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
