"use client";

// Post-familyHistoryMenResponse empathy beat. The answer picks which
// personalized empathy message the user sees on the follow-up response
// page — no branching skip, every answer gets a response.
//
// Mobile source of truth: lib/screens/auth/post_auth_flow_2/pages/hardest_part.dart
// Mobile Firestore field: `hardest_part` (AppConsts.hardestPartFieldName) —
// mirror the id below so the persisted value matches across platforms.

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

// Mirror mobile's _idByLabel table so the persisted Firestore value matches
// across platforms (mobile app + web share the same user doc, and the
// downstream HardestPartResponse interstitial keys off the id, not the label).
const ID_BY_LABEL: Record<string, string> = {
  "Nothing I try works": "nothing_works",
  "I don't know what to do": "dont_know",
  "Seeing my hair get worse": "seeing_worse",
  "Trying to hide my hair loss": "hiding",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function HardestPart() {
  const { answers, updateAnswers, next, back } = useFlow();
  // Shared step — every quiz-taker gets asked. Empathy resonates across
  // genders and the follow-up response is written to land for both.
  void useFunnelConfig();

  const selectedId = answers.hardestPart ?? "";

  const handlePick = (label: string) => {
    lightHaptic();
    updateAnswers({ hardestPart: ID_BY_LABEL[label] });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>
          What&apos;s been the most challenging part of your hair loss journey?
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
