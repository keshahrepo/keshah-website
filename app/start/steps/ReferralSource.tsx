"use client";

// Attribution capture — mirrors ReferralSourcePage from post_auth_flow_2.
// Creator-specific naming (Aadi / Jennifer / Donna) rather than channel
// (TikTok / Instagram) gives per-creator ROI data. Order deliberately mirrors
// mobile: Healthcare professional first (highest-credibility signal), then
// creators by expected volume → warm word-of-mouth → catch-all.
//
// Shared across genders. Mobile hides the back arrow on this step
// (`isShowBack: false`), so this port omits StepHeader's onBack too.
//
// Firestore field: `referral_source` (see AppConsts.referralSourceFieldName).
// Persisted in flow context as `referralSource` (camelCase mirrors the rest
// of QuizAnswers). The integration agent adds the field to QuizAnswers and
// wires the Firestore write in the save helper.

import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { QuizAnswers } from "../lib/types";

// Local widening — `referralSource` will be added to QuizAnswers by the
// integration agent. Cast around it here until that lands.
type AnswersWithReferral = QuizAnswers & { referralSource?: string };

const OPTIONS: { id: string; label: string }[] = [
  { id: "healthcare_professional", label: "Healthcare professional" },
  { id: "founder_aadi", label: "Founder Aadi" },
  { id: "educator_jennifer", label: "Educator Jennifer" },
  { id: "educator_donna", label: "Educator Donna" },
  { id: "friend_or_family", label: "Friend/Family" },
  { id: "other", label: "Other" },
];

export default function ReferralSource() {
  const { answers, updateAnswers, next } = useFlow();
  const selected = (answers as AnswersWithReferral).referralSource;

  const handlePick = (id: string) => {
    lightHaptic();
    updateAnswers({ referralSource: id } as unknown as Partial<QuizAnswers>);
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>{"How did you hear\nabout us?"}</h1>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => handlePick(opt.id)}
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
