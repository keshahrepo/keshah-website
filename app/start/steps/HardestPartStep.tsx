"use client";

/**
 * HardestPartStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hardest_part.dart
 *
 * Single-pick quiz. Answer id (not label) is written to Firestore under
 * `hardest_part` — drives the personalized empathy response on the next
 * step (HardestPartResponseStep). No branching skip; every answer leads
 * onward.
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const ID_BY_LABEL: Record<string, string> = {
  "Nothing I try works": "nothing_works",
  "I don't know what to do": "dont_know",
  "Seeing my hair get worse": "seeing_worse",
  "Trying to hide my hair loss": "hiding",
};

const OPTIONS = Object.keys(ID_BY_LABEL);

export default function HardestPartStep() {
  const { next, back, updateAnswers } = useFlow();

  return (
    <QuizSinglePick
      title="What's been the most challenging part of your hair loss journey?"
      options={OPTIONS}
      onBack={back}
      onComplete={(label) => {
        const id = ID_BY_LABEL[label];
        if (!id) return;
        // Firestore field name: hardest_part
        updateAnswers({ hardestPart: id });
        next();
      }}
    />
  );
}
