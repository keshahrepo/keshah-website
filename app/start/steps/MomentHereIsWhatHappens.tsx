"use client";

/**
 * MomentHereIsWhatHappens — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/moment_here_is_what_happens.dart
 *
 * Cinematic beat right after the pinch test — teases the mechanism
 * ("when your scalp loosens") before the result screenshots. Wraps the
 * shared QuizMoment primitive with the mobile copy verbatim. No Firestore
 * writes; linear (no branching); shown to both genders.
 */

import { QuizMoment } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function MomentHereIsWhatHappens() {
  const { next } = useFlow();
  return (
    <QuizMoment
      text="Here's what happens when your scalp loosens."
      onComplete={next}
    />
  );
}
