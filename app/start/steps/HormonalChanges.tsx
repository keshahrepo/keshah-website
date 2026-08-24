"use client";

// Women's funnel — hormonal-shifts single-pick. Hormonal changes are the
// #1 driver of women's hair loss, so this question lets the follow-up
// interstitial land the most reassuring reframe. Only meaningful answers
// ('postpartum', 'menopause', 'birth_control') fire the response page;
// 'none' / 'not_sure' skip it (mirrors mobile pageMap conditional).
//
// Auto-skips on men (women-only beat per mobile source of truth).

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

// Mirror mobile's _idByLabel table so the persisted Firestore value matches
// across platforms (mobile app + web share the same user doc, and downstream
// analytics key off the id, not the label).
const ID_BY_LABEL: Record<string, string> = {
  Postpartum: "postpartum",
  "Menopause or perimenopause": "menopause",
  "Started/stopped birth control": "birth_control",
  None: "none",
  "Not sure": "not_sure",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function HormonalChanges() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const selectedId = answers.hormonalChanges ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ hormonalChanges: ID_BY_LABEL[label] });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          Have you noticed any hormonal changes?
        </h1>
        <div className={styles.optionList}>
          {OPTIONS.map((label) => {
            const isSelected = selectedId === ID_BY_LABEL[label];
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
        <Button disabled={!selectedId} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
