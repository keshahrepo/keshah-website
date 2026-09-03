"use client";

/**
 * TightHairstylesResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/tight_hairstyles_response.dart
 *
 * Women-only reassurance interstitial after TightHairstyles. Only shown
 * when the user reported daily / sometimes tight styling — "rarely"
 * skips this page via the parent flow's conditional pageMap.
 *
 * No Firestore writes.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function TightHairstylesResponseStep() {
  const { next, back } = useFlow();

  return (
    <QuizInterstitial
      body={
        "Constant pulling can put extra physical stress on your scalp. Your routine will help release that stress so your follicles can breathe again."
      }
      onComplete={next}
      onBack={back}
    />
  );
}
