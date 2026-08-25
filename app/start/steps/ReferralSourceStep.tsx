"use client";

/**
 * ReferralSourceStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/referral_source_page.dart
 *
 * Creator-specific attribution. The user picks who/where they heard about
 * KESHAH; stable ids are what we persist (not the display label) so that
 * per-creator ROI dashboards are stable across copy changes.
 *
 * Order matches mobile exactly (healthcare pro first for high-trust
 * medical-recommendation signal, then creators by expected volume, then
 * warm word-of-mouth, then catch-all).
 *
 * Firestore field written: `referral_source` (stored under the
 * `referralSource` key on QuizAnswers → persisted to that Firestore field
 * downstream by the sign-up step).
 */

import { QuizSinglePick } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

interface SourceOption {
  id: string;
  title: string;
}

const OPTIONS: SourceOption[] = [
  { id: "healthcare_professional", title: "Healthcare professional" },
  { id: "founder_aadi", title: "Founder Aadi" },
  { id: "educator_jennifer", title: "Educator Jennifer" },
  { id: "educator_donna", title: "Educator Donna" },
  { id: "friend_or_family", title: "Friend/Family" },
  { id: "other", title: "Other" },
];

export default function ReferralSourceStep() {
  const { next, updateAnswers } = useFlow();

  return (
    <QuizSinglePick
      title={"How did you hear\nabout us?"}
      options={OPTIONS.map((o) => o.title)}
      onComplete={(label) => {
        const match = OPTIONS.find((o) => o.title === label);
        if (!match) return;
        updateAnswers({ referralSource: match.id });
        next();
      }}
    />
  );
}
