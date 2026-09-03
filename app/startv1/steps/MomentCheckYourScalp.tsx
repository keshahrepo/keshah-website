"use client";

/**
 * MomentCheckYourScalp — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/moment_check_your_scalp.dart
 *
 * Cinematic auto-advancing beat that primes the pinch test. Wraps the
 * shared QuizMoment primitive with the mobile copy verbatim. No Firestore
 * writes; linear (no branching); shown to both genders.
 */

import { QuizMoment } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function MomentCheckYourScalp() {
  const { next } = useFlow();
  return <QuizMoment text="Let's check your scalp." onComplete={next} />;
}
