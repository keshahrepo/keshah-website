"use client";

/**
 * HardestPartResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hardest_part_response.dart
 *
 * Empathy interstitial after HardestPart. Body copy branches on the
 * user's specific pain point. Writes nothing to Firestore.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

const BODY_BY_ID: Record<string, string> = {
  nothing_works:
    "Have you ever worked on your scalp? Where your hair actually grows? I hadn't. I just kept applying more and more products to a scalp that was tight and hurt when I pressed it.\n\nNoticing my scalp get looser in the first week gave me the confidence that something was actually changing. It helped reduce my anxiety even before my hair changed.",
  dont_know:
    "There's so much information out there. I was constantly wondering if I should try another oil, supplement, shampoo or just fly to Turkey.\n\nNoticing my scalp get looser in the first week gave me the confidence that something was actually changing. It helped reduce my anxiety even before my hair changed.",
  seeing_worse:
    "The difficult thing about hair loss is that it feels like a ticking time-bomb.\n\nNoticing my scalp get looser in the first week gave me the confidence that something was actually changing. It helped reduce my anxiety even before my hair changed.",
  hiding:
    "I used to think about my hair before going anywhere. How should I style it? How can I grow out my hair to cover the balding areas?\n\nNoticing my scalp get looser in the first week gave me the confidence that something was actually changing. It helped reduce my anxiety even before my hair changed.",
};

export default function HardestPartResponseStep() {
  const { next, back, answers } = useFlow();
  const body = BODY_BY_ID[answers.hardestPart ?? ""] ?? BODY_BY_ID.nothing_works;
  return <QuizInterstitial body={body} onComplete={next} onBack={back} />;
}
