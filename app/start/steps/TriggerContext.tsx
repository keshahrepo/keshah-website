"use client";

// Women's funnel trigger + hormonal context. Combines the "did this start
// after X" trigger event question with the "are you also dealing with Y"
// hormonal/medical context. Names triggers explicitly (postpartum, peri-
// menopause, COVID, PCOS, thyroid, ferritin) instead of vague "hormonal
// changes" — audience research showed naming the specific trigger is what
// makes the woman feel SEEN.
//
// Auto-skips on men's funnels.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const TRIGGERS = [
  "Postpartum (within the last 2 years)",
  "Perimenopause or menopause",
  "After COVID",
  "A major stress event (divorce, grief, illness)",
  "Started or stopped hormonal birth control",
  "Started or stopped HRT",
  "I have PCOS",
  "I have hypothyroidism or Hashimoto's",
  "Low ferritin / iron deficiency",
  "Years of tight ponytails, extensions, or braids",
  "I'm not sure when it started",
];

export default function TriggerContext() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const selected = answers.triggerContext ?? [];

  const toggle = (label: string) => {
    lightHaptic();
    if (selected.includes(label)) {
      updateAnswers({ triggerContext: selected.filter((s) => s !== label) });
    } else {
      updateAnswers({ triggerContext: [...selected, label] });
    }
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>Did your hair start changing around any of these?</h1>
        <p className={styles.subtitle}>Pick all that apply. We&apos;ll use this to personalize your plan.</p>
        <div className={styles.optionList}>
          {TRIGGERS.map((label) => {
            const isSelected = selected.includes(label);
            return (
              <button
                key={label}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => toggle(label)}
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
        <Button disabled={selected.length === 0} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
