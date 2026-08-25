"use client";

/**
 * FamilyHistoryStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/family_history_men.dart
 *
 * Single-pick quiz: "Does hair loss run in your family?" with options
 * Yes / Maybe / No / Not sure, mapped to ids yes / maybe / no / not_sure.
 *
 * Firestore field: `family_history_men` (mobile file/id kept for legacy;
 * universal — shown for both genders).
 * Branching: "no" and "not_sure" skip the follow-up response interstitial
 * (handled by the parent step registry, not here).
 * Gender: both.
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const ID_BY_LABEL: Record<string, string> = {
  Yes: "yes",
  Maybe: "maybe",
  No: "no",
  "Not sure": "not_sure",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function FamilyHistoryStep() {
  const { next, updateAnswers, back } = useFlow();

  return (
    <QuizSinglePick
      title="Does hair loss run in your family?"
      options={OPTIONS}
      onBack={back}
      onComplete={(label) => {
        const id = ID_BY_LABEL[label];
        if (!id) return;
        // Firestore field name: family_history_men
        updateAnswers({ familyHistory: id } as Partial<
          Parameters<typeof updateAnswers>[0]
        >);
        next();
      }}
    />
  );
}
