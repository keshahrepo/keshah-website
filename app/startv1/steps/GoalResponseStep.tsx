"use client";

/**
 * GoalResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/goal_response_page.dart
 *
 * Universal interstitial after HairGoal. Copy branches on the user's
 * answer to meet each goal where it is; language swaps
 * "scalp exercises" (men) <-> "scalp massages" (women).
 *
 * Women pick multiple hair goals (hairGoals[]); collapse them to the
 * same 3-bucket space as the men's single-select via the same rules
 * as _mapWomenGoalsToBucket in the mobile controller.
 *
 * Writes nothing to Firestore (pure interstitial).
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import type { HairGoal } from "../lib/types";

function mapWomenGoalsToBucket(goals: HairGoal[] | undefined): HairGoal {
  if (!goals || goals.length === 0) return "stop_the_loss";
  const hasRegrow = goals.includes("regrow_hair");
  if (hasRegrow && goals.length > 1) return "both";
  if (hasRegrow) return "regrow_hair";
  return "stop_the_loss";
}

function bodyText(goal: HairGoal | undefined, gender: string | undefined): string {
  const word = gender === "female" ? "massages" : "exercises";
  switch (goal) {
    case "regrow_hair":
      return `KESHAH first stops your hair loss with scalp ${word}. Once that's under control, you can add our optional microneedling add-on in the app to regrow new hair in bald areas.`;
    case "both":
      return `Scalp ${word} help stop hair loss and maintain long-term. Once you're ready to regrow new hair in bald areas, you can add our optional microneedling add-on in the app.`;
    case "stop_the_loss":
    default:
      return `Perfect. Scalp ${word} will stop your hair loss and help maintain it long-term.`;
  }
}

export default function GoalResponseStep() {
  const { next, back, answers } = useFlow();
  const gender = answers.gender;
  const goal: HairGoal | undefined =
    gender === "female" ? mapWomenGoalsToBucket(answers.hairGoals) : answers.hairGoal;

  return <QuizInterstitial body={bodyText(goal, gender)} onComplete={next} onBack={back} />;
}
