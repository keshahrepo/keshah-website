"use client";

// Age bucket capture. Buckets match Facebook ad-targeting slices exactly
// so quiz-responses dashboards can push per-bucket conversion rates
// straight to Meta ads with zero translation.
//
// Under-18 is intentionally omitted — the funnel already gates minors
// via the qualification flow, and Meta ads can't legally target them.
//
// Mirrors mobile /lib/screens/auth/post_auth_flow_2/pages/age_page.dart.
// Firestore field written on save-profile: `age_range` (matches
// AppConsts.ageRangeFieldName in the mobile app).

import { useFlow } from "../lib/flow-context";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { QuizAnswers } from "../lib/types";

// Symmetric label ↔ bucket mapping — the persisted value IS the display
// label. Keeps parity with mobile's `_bucketByLabel` table so the
// Firestore string is identical across platforms and Meta ads slicing
// keys off the same values.
const BUCKETS = ["18-24", "25-34", "35-44", "45-54", "55+"] as const;

// ageRange is not yet in QuizAnswers — the integration agent adds the
// field to lib/types.ts when wiring this step in. Cast keeps the step
// self-contained without touching shared types.
type AnswersWithAge = QuizAnswers & { ageRange?: string };

export default function Age() {
  const { answers, updateAnswers, next, back } = useFlow();
  const selected = (answers as AnswersWithAge).ageRange;

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>What&apos;s your age?</h1>
        <div className={styles.optionList}>
          {BUCKETS.map((bucket) => {
            const isSelected = selected === bucket;
            return (
              <button
                key={bucket}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => {
                  lightHaptic();
                  updateAnswers({ ageRange: bucket } as Partial<QuizAnswers>);
                }}
              >
                <span>{bucket}</span>
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
