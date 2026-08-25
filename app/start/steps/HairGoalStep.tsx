"use client";

/**
 * HairGoalStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/hair_goal_page.dart
 * plus the female multi-pick branch defined inline in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/post_auth_flow_2.dart
 * (see the `PostAuthFlow2Step.hairGoal` case).
 *
 * Men: single-pick — writes Firestore `hair_goal` with the id
 *   ("stop_the_loss" / "regrow_hair" / "both"). Title "What's your goal?".
 * Women: multi-pick — writes Firestore `hair_goals` with the raw option
 *   labels (matching mobile which forwards the selected label strings).
 *   Title "What's your hair goal?" + subtitle "Pick all that apply."
 *
 * Gender branch reads `answers.gender` from the flow context.
 */

import { QuizMultiPick, QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import type { HairGoal } from "../lib/types";

interface MaleOption {
  id: HairGoal;
  title: string;
}

const MALE_OPTIONS: MaleOption[] = [
  { id: "stop_the_loss", title: "Stop the loss" },
  { id: "regrow_hair", title: "Regrow hair" },
  { id: "both", title: "Both" },
];

const FEMALE_OPTIONS = [
  "Stop my hair from thinning",
  "Regrow what I've lost",
  "Thicker, fuller hair",
  "Support my scalp health",
  "Feel more confident",
];

export default function HairGoalStep() {
  const { answers, next, updateAnswers } = useFlow();

  if (answers.gender === "female") {
    return (
      <QuizMultiPick
        title="What's your hair goal?"
        subtitle="Pick all that apply."
        options={FEMALE_OPTIONS}
        onComplete={(values) => {
          // Mobile forwards the raw label strings to Firestore under
          // `hair_goals`, so mirror that here — the downstream mapping
          // (bucketing to a HairGoal enum for GoalResponse) happens
          // elsewhere. Firestore field name: hair_goals.
          updateAnswers({ hairGoals: values as HairGoal[] });
          next();
        }}
      />
    );
  }

  return (
    <QuizSinglePick
      title="What's your goal?"
      options={MALE_OPTIONS.map((o) => o.title)}
      onComplete={(label) => {
        const match = MALE_OPTIONS.find((o) => o.title === label);
        if (!match) return;
        // Firestore field name: hair_goal (single-select id).
        updateAnswers({ hairGoal: match.id });
        next();
      }}
    />
  );
}
