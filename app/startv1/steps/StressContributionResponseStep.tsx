"use client";

/**
 * StressContributionResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/stress_contribution_response.dart
 *
 * Educational interstitial after StressContribution. Explains the
 * "stress -> tight muscles -> scalp pull" chain and reframes KESHAH as
 * the physical loosening step. Skipped when the user answered "no" to
 * stress_contribution (parent flow gates this page).
 *
 * No Firestore writes.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function StressContributionResponseStep() {
  const { next, back } = useFlow();

  return (
    <QuizInterstitial
      body={
        "When you're stressed, your body activates the 'fight or flight' response and your scalp muscles tighten up.¹ KESHAH releases that tension and restores the blood flow your hair needs to grow.\n\nYou can't always remove stress from your life, but you can undo its physical impact on your hair."
      }
      footer={
        "¹ Mental stress can increase muscle activity. Scalp muscles can transmit mechanical force into the scalp.\n\nLundberg et al., 1994 · Tellez-Segura, 2015"
      }
      onComplete={next}
      onBack={back}
    />
  );
}
