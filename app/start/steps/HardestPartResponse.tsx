"use client";

// Men-only empathy interstitial after HardestPart. Body copy switches on
// the user's specific pain point, all four variants land on the same
// "noticing my scalp get looser in the first week gave me the confidence…"
// close so the read-through feels like Aadi telling his story from the
// reader's exact starting frame.
//
// Each variant splits on a paragraph break — first paragraph is the "I've
// been where you are" empathetic setup, second is the "here's what changed
// for me" payoff. The split gives the read a beat of breathing room and
// mirrors how Aadi would actually tell it.
import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

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

export default function HardestPartResponse() {
  const { answers, next } = useFlow();
  // Read the hardest-part answer written by the previous step. Type asserted
  // here because the field lives in QuizAnswers via the integration agent.
  const hardestPart = (answers as { hardestPart?: string }).hardestPart;
  // Fall back to `nothing_works` if the state field is somehow empty
  // (e.g. a stale saved-step resume where the user landed here without
  // an answer). Keeps the screen from rendering blank.
  const bodyText = BODY_BY_ID[hardestPart ?? ""] ?? BODY_BY_ID.nothing_works;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>{bodyText}</p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
