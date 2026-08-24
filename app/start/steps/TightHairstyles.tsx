"use client";

// Women's funnel — tight-hairstyles single-pick. Traction from tight ponytails,
// buns, or braids adds mechanical pull on the same follicles the scalp-tension
// routine aims to release. Only meaningful answers ('daily' / 'sometimes')
// fire the follow-up reassurance interstitial; 'rarely' skips it (mirrors the
// mobile pageMap conditional in post_auth_flow_2.dart).
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
// analytics key off the id, not the label). Field name on Firestore is
// `tight_hairstyles` (AppConsts.tightHairstylesFieldName).
const ID_BY_LABEL: Record<string, string> = {
  "Every day": "daily",
  "A few times a week": "sometimes",
  "Rarely or never": "rarely",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function TightHairstyles() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const selectedId = answers.tightHairstyles ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ tightHairstyles: ID_BY_LABEL[label] });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          How often do you wear tight ponytails, buns, or braids?
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
