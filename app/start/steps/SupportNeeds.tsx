"use client";

import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { SupportNeed } from "../lib/types";

const OPTIONS: { id: SupportNeed; label: string }[] = [
  { id: "get_off_medication", label: "I want to get off medication" },
  { id: "fix_dandruff", label: "I want to fix dandruff / oily scalp" },
  { id: "dht_hormones", label: "I want help with DHT / hormones" },
  { id: "stress", label: "I want help with stress" },
  { id: "bloodwork_vitamins", label: "I want help with blood work / vitamins" },
  { id: "diet", label: "I want help with diet" },
];

export default function SupportNeeds() {
  const { answers, updateAnswers, next, back } = useFlow();
  const selected = answers.supportNeeds ?? [];

  const toggle = (id: SupportNeed) => {
    lightHaptic();
    if (selected.includes(id)) {
      updateAnswers({ supportNeeds: selected.filter((s) => s !== id) });
    } else {
      updateAnswers({ supportNeeds: [...selected, id] });
    }
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>{"What else can\nwe help you with?"}</h1>
        <p className={styles.subtitle}>Select all that apply.</p>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => toggle(opt.id)}
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
        <Button onClick={next}>Continue</Button>
      </div>
    </div>
  );
}
