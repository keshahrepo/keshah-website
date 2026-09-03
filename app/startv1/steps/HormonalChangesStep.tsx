"use client";

/**
 * HormonalChangesStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hormonal_changes.dart
 *
 * Women-only single-pick. Writes Firestore field `hormonal_changes` with
 * the id ('postpartum' / 'menopause' / 'birth_control' / 'none' /
 * 'not_sure'). Only the first three ids fire the follow-up reassurance
 * page — that branching is handled by the parent flow, not here.
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const ID_BY_LABEL: Record<string, string> = {
  "Postpartum": "postpartum",
  "Menopause or perimenopause": "menopause",
  "Started/stopped birth control": "birth_control",
  "None": "none",
  "Not sure": "not_sure",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function HormonalChangesStep() {
  const { next, updateAnswers } = useFlow();

  return (
    <QuizSinglePick
      title="Have you noticed any hormonal changes?"
      options={OPTIONS}
      onComplete={(label) => {
        const id = ID_BY_LABEL[label];
        if (!id) return;
        // Firestore field: hormonal_changes
        updateAnswers({ hormonalChanges: id });
        next();
      }}
    />
  );
}
