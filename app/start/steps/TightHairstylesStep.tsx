"use client";

/**
 * TightHairstylesStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/tight_hairstyles.dart
 *
 * Women-only quiz beat. Traction from tight ponytails / buns / braids adds
 * mechanical pull to the same follicles the scalp-tension routine aims to
 * release. Only 'daily' / 'sometimes' answers fire the follow-up response —
 * 'rarely' skips it via a conditional pageMap entry in the parent flow.
 *
 * Firestore field: `tight_hairstyles` (single-select id).
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const ID_BY_LABEL: Record<string, string> = {
  "Every day": "daily",
  "A few times a week": "sometimes",
  "Rarely or never": "rarely",
};

export default function TightHairstylesStep() {
  const { next, back, updateAnswers } = useFlow();

  return (
    <QuizSinglePick
      title="How often do you wear tight ponytails, buns, or braids?"
      options={Object.keys(ID_BY_LABEL)}
      onBack={back}
      onComplete={(label) => {
        const id = ID_BY_LABEL[label];
        if (!id) return;
        updateAnswers({ tightHairstyles: id });
        next();
      }}
    />
  );
}
