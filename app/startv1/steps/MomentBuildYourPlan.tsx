"use client";

/**
 * MomentBuildYourPlan — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/moment_build_your_plan.dart
 *
 * Cinematic beat that pivots from proof screenshots into the quiz block.
 * Wraps the shared QuizMoment primitive with the mobile copy verbatim.
 * No Firestore writes; linear (no branching); shown to both genders.
 */

import { QuizMoment } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function MomentBuildYourPlan() {
  const { next } = useFlow();
  return <QuizMoment text="Let's build your plan." onComplete={next} />;
}
