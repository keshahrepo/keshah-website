"use client";

// Women's funnel symptom checklist — uses the exact vocabulary women in the
// audience research used: "wider part," "thinner ponytail," "more scalp
// showing in bright light," "shower drain," "snappy ends," "frizz halo."
//
// Critically includes "My scalp feels tender, tight, or sore" — almost no
// competitor quiz asks this and it's THE differentiator question for KESHAH
// because the product directly addresses scalp tension. A woman who selects
// it lands on the paywall convinced this product was built for her.
//
// Auto-skips on men's funnels so the global STEP_ORDER stays consistent.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const SYMPTOMS = [
  "My part is wider than it was",
  "My ponytail feels thinner",
  "More scalp shows under bright bathroom light",
  "More hair than usual in the shower drain or my brush",
  "My ends snap and won't grow past a certain length",
  "Short “baby hairs” around my hairline that won't grow long",
  "My scalp feels tender, tight, or sore at the roots",
];

export default function HairSymptoms() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  // Auto-skip on men's funnels — this step is women-specific and the men's
  // funnel doesn't need a symptom checklist (it has its own qualification).
  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const selected = answers.hairSymptoms ?? [];

  const toggle = (label: string) => {
    lightHaptic();
    if (selected.includes(label)) {
      updateAnswers({ hairSymptoms: selected.filter((s) => s !== label) });
    } else {
      updateAnswers({ hairSymptoms: [...selected, label] });
    }
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>Which of these sound like you?</h1>
        <p className={styles.subtitle}>Pick all that apply. There&apos;s no wrong answer.</p>
        <div className={styles.optionList}>
          {SYMPTOMS.map((label) => {
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
