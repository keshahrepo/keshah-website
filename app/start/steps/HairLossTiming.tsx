"use client";

// Women's funnel — "When did you first notice changes to your hair?"
// Mirrors Hers' diagnostic question. Auto-skips on men (men's flow keeps
// the leaner severity question only).

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = [
  "Over a year ago",
  "Over the past year",
  "Over the past few months",
  "I'm not sure",
];

export default function HairLossTiming() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const selected = answers.hairLossTiming ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ hairLossTiming: label });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          When did you start noticing changes?
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
