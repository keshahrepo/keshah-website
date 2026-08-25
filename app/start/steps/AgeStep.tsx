"use client";

/**
 * AgeStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/age_page.dart
 *
 * 5-bucket age select. Buckets match Facebook ad-targeting slices exactly
 * so quiz-responses dashboard conversion rates can be pushed to Meta ads
 * with zero translation. Under-18 intentionally omitted (minors gated
 * earlier + Meta legally can't target them).
 *
 * Firestore field written: `age_range` (matches mobile AppConsts.ageRangeFieldName).
 * Linear (no branching), shown to both genders.
 * Skipped by mobile if age_range already set — the orchestrator handles skip.
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const AGE_BUCKETS = ["18-24", "25-34", "35-44", "45-54", "55+"];

export default function AgeStep() {
  const { next, back, updateAnswers } = useFlow();
  return (
    <QuizSinglePick
      title="What's your age?"
      options={AGE_BUCKETS}
      onComplete={(bucket) => {
        // Persist to flow context under `ageRange`; the flow's save layer
        // maps it to Firestore field `age_range` (mobile parity).
        updateAnswers({ ageRange: bucket });
        next();
      }}
      onBack={back}
    />
  );
}
