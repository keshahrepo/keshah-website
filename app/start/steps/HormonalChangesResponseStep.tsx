"use client";

/**
 * HormonalChangesResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hormonal_changes_response.dart
 *
 * Women-only reassurance interstitial after HormonalChanges. Only shown
 * when the user reported a real hormonal shift (postpartum / menopause /
 * birth_control). 'none' / 'not_sure' skip via the parent flow's
 * conditional pageMap. Writes nothing to Firestore.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function HormonalChangesResponseStep() {
  const { next, back } = useFlow();

  return (
    <QuizInterstitial
      body="Your routine won't reset your hormones, but it will help fix the scalp tension that shows up alongside them. Most women see results without ever having to touch their hormones."
      onComplete={next}
      onBack={back}
    />
  );
}
