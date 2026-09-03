"use client";

/**
 * StressContributionStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/stress_contribution.dart
 *
 * Single-pick quiz: "Do you feel that stress could be contributing to your
 * hair loss?" with options Yes / Maybe / No, mapped to ids yes/maybe/no.
 *
 * Firestore field: `stress_contribution` (matches mobile's onComplete id).
 * Branching: a "no" answer skips the follow-up response page (handled by
 * the parent step registry, not here).
 * Gender: both.
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const ID_BY_LABEL: Record<string, string> = {
  Yes: "yes",
  Maybe: "maybe",
  No: "no",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function StressContributionStep() {
  const { next, updateAnswers, back } = useFlow();

  return (
    <QuizSinglePick
      title="Do you feel that stress could be contributing to your hair loss?"
      options={OPTIONS}
      onBack={back}
      onComplete={(label) => {
        const id = ID_BY_LABEL[label];
        if (!id) return;
        // Firestore field name: stress_contribution
        updateAnswers({ stressContribution: id } as Partial<
          Parameters<typeof updateAnswers>[0]
        >);
        next();
      }}
    />
  );
}
