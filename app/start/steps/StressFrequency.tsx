"use client";

// Men's stress frequency question with the under-question educational box
// naming telogen effluvium. Trust escalation moment — most men have heard
// "stress causes hair loss" but never seen the medical term, so naming it
// here positions KESHAH as the people who actually know what's happening.
//
// Auto-skips on women.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = ["All the time", "Sometimes", "Rarely", "Not sure"];

export default function StressFrequency() {
  const { answers, updateAnswers, next, back } = useFlow();
  // Renders for both genders — stress affects female hair cycles via
  // cortisol/telogen effluvium and is a primary Hers diagnostic question.
  void useFunnelConfig();

  const selected = answers.stressFrequency ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ stressFrequency: label });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          How often do you experience stress?
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
