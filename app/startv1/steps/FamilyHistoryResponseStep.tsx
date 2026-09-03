"use client";

/**
 * FamilyHistoryResponseStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/family_history_men_response.dart
 *
 * Universal reframe interstitial after FamilyHistory (shown to both
 * genders). Only rendered when the user answered yes/maybe — the parent
 * flow skips this for no/not-sure. Language flexes on gender: men see
 * "scalp exercises", women see "scalp massages". Writes nothing to
 * Firestore.
 */

import { QuizInterstitial } from "../components/primitives";
import { useFlow } from "../lib/flow-context";

export default function FamilyHistoryResponseStep() {
  const { next, back, answers } = useFlow();

  const word = answers.gender === "female" ? "massages" : "exercises";

  const body =
    `Hair loss patterns often repeat in families, but your genetics aren't set in stone.\n\nWhen I dug into the research, I found something wild: scalp stimulation through ${word} can actually change gene expression, turning on genes tied to hair growth and turning off ones tied to hair loss.¹`;

  const footer =
    "¹ In one clinical study, standardized scalp stimulation up-regulated 2,655 genes and down-regulated 2,823, with increases in hair cycle-related genes and decreases in hair loss-related genes.\n\nKoyama et al., 2016 · English & Barman, 2019";

  return (
    <QuizInterstitial
      body={body}
      footer={footer}
      onComplete={next}
      onBack={back}
    />
  );
}
