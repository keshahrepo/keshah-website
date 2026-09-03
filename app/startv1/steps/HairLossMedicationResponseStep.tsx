"use client";

/**
 * HairLossMedicationResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hair_loss_medication_men_response.dart
 *
 * Interstitial reframe branching on the medication answer. Copy meets
 * the user where they are: "you can keep using it" for medication
 * users, "you don't need it" for non-users. Writes nothing to Firestore.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

function bodyText(answer: string | undefined): string {
  if (answer === "no") {
    return "Most members see results with their KESHAH routine alone. No medication needed.";
  }
  return "Medication works on your hormones. KESHAH works on your scalp tension. They're complementary, so you can keep your medication and add KESHAH on top.";
}

export default function HairLossMedicationResponseStep() {
  const { next, back, answers } = useFlow();
  const answer = answers.hairLossMedication ?? answers.hairLossMedicationMen;
  return <QuizInterstitial body={bodyText(answer)} onComplete={next} onBack={back} />;
}
