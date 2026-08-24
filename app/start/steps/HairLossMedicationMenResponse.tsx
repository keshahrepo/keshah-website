"use client";

// Reassurance interstitial after the medication question. Copy branches on
// the answer so the reassurance meets the user where they are: "you can
// keep using it" for medication users, "you don't need it" for non-users.
// Either way, the goal is to remove medication status as a perceived
// blocker to trying KESHAH. Shown to both genders — the parent question
// (HairLossMedicationMen) is shared even though the widget class is still
// named _men for legacy reasons. Falls back to the "yes" copy for any
// unexpected value so the page never renders empty on a legacy/bad answer.

import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function HairLossMedicationMenResponse() {
  const { answers, next } = useFlow();
  // Read from the answer key the preceding HairLossMedicationMen step
  // writes. Values are the stable ids 'yes' / 'no' (not the display labels).
  const answer = (answers as { hairLossMedicationMen?: string }).hairLossMedicationMen;

  const body =
    answer === "no"
      ? "Most members see results with their KESHAH routine alone. No medication needed."
      : "Medication works on your hormones. KESHAH works on your scalp tension. They're complementary, so you can keep your medication and add KESHAH on top.";

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>{body}</p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
