"use client";

/**
 * HairLossMedicationStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hair_loss_medication_men.dart
 *
 * Universal yes/no gate (name kept as *Men for legacy). Subtitle drug list
 * swaps by gender — men see Min/Fin/Dut, women see Min/Spiro/supplements.
 * Non-branching in itself; the follow-up response reads the saved id.
 *
 * Display labels map to stable ids so Firestore holds 'yes' / 'no':
 *   Yes -> 'yes'
 *   No  -> 'no'
 *
 * Firestore field written: `hair_loss_medication` (mobile parity).
 * Shown to both genders.
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const ID_BY_LABEL: Record<string, string> = {
  Yes: "yes",
  No: "no",
};

export default function HairLossMedicationStep() {
  const { answers, next, back, updateAnswers } = useFlow();
  const subtitle =
    answers.gender === "female"
      ? "Like Minoxidil, Spironolactone, or supplements"
      : "Like Minoxidil, Finasteride, or Dutasteride";
  return (
    <QuizSinglePick
      title="Are you using hair loss medication right now?"
      subtitle={subtitle}
      options={Object.keys(ID_BY_LABEL)}
      onComplete={(label) => {
        const id = ID_BY_LABEL[label];
        // Persist under both keys — hairLossMedication is the canonical
        // key mapped to Firestore field `hair_loss_medication`; the
        // legacy *Men alias is kept so any response step reading it
        // via type-cast resolves the same value.
        updateAnswers({ hairLossMedication: id, hairLossMedicationMen: id });
        next();
      }}
      onBack={back}
    />
  );
}
