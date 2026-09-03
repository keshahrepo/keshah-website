"use client";

/**
 * QuizGenderStep — port of the Flutter QuizGenderPage in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/quiz_gender_page.dart
 *
 * Mobile layout:
 *   BackArrowWithAppLogo (logoScale 0.85, no back button)
 *   flex-1 spacer
 *   Title  "What's your gender?"
 *   32px gap
 *   Column of gender options (Male / Female) with checkmark on selected
 *   flex-2 spacer
 *   Continue button (white pill, dimmed until a selection is made)
 *
 * Animation (1000ms controller, staggered fade windows):
 *   - title  fade 0.0-0.4
 *   - list   fade 0.2-0.7
 *   - button fade 0.5-1.0
 *
 * Firestore field written: `selected_gender` — "male" | "female".
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";
import type { Gender } from "../lib/types";

// Mirrors lib/data/enum/user_gender_enum.dart — display label + serialized
// enum name written to Firestore under `selected_gender`.
const GENDER_OPTIONS: Array<{ label: string; value: Gender }> = [
  { label: "Male", value: "male" },
  { label: "Female", value: "female" },
];

export default function QuizGenderStep() {
  const { updateAnswers, next } = useFlow();

  return (
    <QuizSinglePick
      title="What's your gender?"
      options={GENDER_OPTIONS.map((o) => o.label)}
      onComplete={(label) => {
        const picked = GENDER_OPTIONS.find((o) => o.label === label);
        if (!picked) return;
        updateAnswers({ gender: picked.value });
        next();
      }}
    />
  );
}
