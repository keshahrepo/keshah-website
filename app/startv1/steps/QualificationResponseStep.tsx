"use client";

/**
 * QualificationResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/qualification_response.dart
 *
 * Women-only transition between Qualification and the first quiz question.
 * Confirms fit, names KESHAH as the plan-builder, primes personalization.
 * Uses the shared QuizInterstitial primitive with mobile copy verbatim.
 * No Firestore writes; linear (no branching); gender-gated to female.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function QualificationResponseStep() {
  const { next, back } = useFlow();
  return (
    <QuizInterstitial
      title="Great, KESHAH scalp massages can help with your thinning hair."
      body="Let's build your plan."
      onComplete={next}
      onBack={back}
    />
  );
}
