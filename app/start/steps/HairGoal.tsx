"use client";

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { HairGoal as HairGoalId } from "../lib/types";

const MEN_OPTIONS: { id: HairGoalId; label: string }[] = [
  { id: "stop_the_loss", label: "Stop the loss" },
  { id: "regrow_hair", label: "Regrow hair" },
  { id: "both", label: "Both" },
];

// Women's set is multi-select (Hers pattern) — captures functional and
// emotional outcomes together. "Select all that apply" subhead matches Hers.
// Writes to `hairGoals` (array) instead of `hairGoal` (single). Men's funnel
// keeps single-select to preserve simplicity in that flow.
const WOMEN_OPTIONS: { id: HairGoalId; label: string }[] = [
  { id: "stop_the_loss", label: "Reduce shedding" },
  { id: "thicker_fuller", label: "Improve thickness and fullness" },
  { id: "regrow_hair", label: "Regrow lost hair" },
  { id: "support_health", label: "Support hair health" },
  { id: "feel_confident", label: "Feel more confident" },
];

export default function HairGoal() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  if (isWomen) {
    const selected = answers.hairGoals ?? [];
    const toggle = (id: HairGoalId) => {
      lightHaptic();
      const next = selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id];
      updateAnswers({ hairGoals: next });
    };
    return (
      <div className={styles.stepBody}>
        <StepHeader onBack={back} />
        <div className={styles.stepInner}>
          <h1 className={styles.headline}>What are your hair goals?</h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--fg-55)",
              marginTop: 4,
              marginBottom: 16,
            }}
          >
            Select all that apply.
          </p>
          <div className={styles.optionList}>
            {WOMEN_OPTIONS.map((opt) => {
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
          <Button disabled={selected.length === 0} onClick={next}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  // Men's single-select — unchanged behavior.
  const selected = answers.hairGoal;
  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>What&apos;s your goal?</h1>
        <div className={styles.optionList}>
          {MEN_OPTIONS.map((opt) => {
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
