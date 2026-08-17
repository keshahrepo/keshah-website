"use client";

// Men's funnel de-risked opener — replaces the heavy "Is KESHAH right for
// you?" Qualification gate that disqualified men with hard yes/no. Hims-
// style 5-door pattern that captures intent + commitment + preventive
// shoppers in one screen, no one can fail to qualify, momentum stays high.
//
// Auto-skips on women's funnels (women see the dedicated Qualification
// step which already lists postpartum/peri/PCOS/thyroid in its FOR list).

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = [
  "Receding hairline, want to slow it down",
  "Thinning at the crown, want to keep what I have",
  "Visible hair loss, ready to start now",
  "No hair loss yet, want to get ahead of it",
  "Not sure where I am",
];

export default function HairSituation() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isMen = config.audience !== "women" && answers.gender !== "female";

  // Auto-skip on women — they see Qualification (which lists postpartum +
  // perimenopause + PCOS as FOR) instead of this men-coded opener.
  useEffect(() => {
    if (!isMen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMen]);

  if (!isMen) return null;

  const selected = answers.hairSituation ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ hairSituation: label });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          Which best describes your hair situation?
        </h1>
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
