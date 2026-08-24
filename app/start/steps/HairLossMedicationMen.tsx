"use client";

// Universal medication question (mobile file kept the historical name
// `HairLossMedicationMenPage` but is now shown to both genders). Non-branching
// gate — the response is the same yes/no and copy afterwards is universal.
// We still collect it because Min/Fin/Dut/Spiro users have different worry
// patterns and it's a useful segmentation dimension for later messaging.
//
// Mirrors mobile source of truth:
//   lib/screens/auth/post_auth_flow_2/pages/hair_loss_medication_men.dart
// Persists to the same Firestore field as mobile: `hair_loss_medication`
// (mapped from the camelCase `hairLossMedication` answer key when the profile
// is written on paywall success — same convention peer quiz steps follow).
// Only the subtitle drug list swaps by gender — men see Min/Fin/Dut, women
// see Min/Spiro/supplements.

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { QuizAnswers } from "../lib/types";

// Mirror mobile's _idByLabel table so persisted value matches across
// platforms (mobile app + web share the same user doc, downstream analytics
// key off the id — 'yes' / 'no' — not the English label).
const OPTIONS = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export default function HairLossMedicationMen() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  const subtitle = isWomen
    ? "Like Minoxidil, Spironolactone, or supplements"
    : "Like Minoxidil, Finasteride, or Dutasteride";

  // hairLossMedication isn't declared on QuizAnswers yet — the integration
  // agent adds it when it wires this step into STEP_ORDER + types.ts. Cast
  // through unknown so the file compiles today; once the field is added the
  // cast becomes a no-op and can be removed.
  const selected =
    (answers as unknown as { hairLossMedication?: string }).hairLossMedication ?? "";

  const handlePick = (id: string) => {
    lightHaptic();
    updateAnswers({ hairLossMedication: id } as unknown as Partial<QuizAnswers>);
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>Are you using hair loss medication right now?</h1>
        <p className={styles.subtitle}>{subtitle}</p>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => handlePick(opt.id)}
              >
                <span>{opt.label}</span>
                <span className={`${styles.optionCheck} ${isSelected ? styles.optionCheckActive : ""}`}>
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.buttonRow}>
        <Button disabled={!selected} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
