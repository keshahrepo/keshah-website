"use client";

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

// Dermarollers / Dermastamps included as a separate option — users who tried
// home microneedling are good prospects for the regrowth phase upsell, so we
// have a specific response that validates microneedling as legitimate but
// pivots to "most people do it wrong, we'll show you the right way."
// PRP and Stem Cells are combined since the response message treats them the
// same ("the best PRP & stem cells clinics recommend scalp exercises...").
const MEN_OPTIONS = [
  "Minoxidil (Rogaine)",
  "Finasteride / DHT Blocker",
  "Hair loss shampoos",
  "Supplements / vitamins",
  "Rosemary / essential oils",
  "Dermarollers / Dermastamps",
  "PRP / Stem Cells",
  "Hair transplant",
  "Nothing",
];

// Women's options reflect what THIS demo has actually tried (per audience
// research): Nutrafol, Hers, Vegamour, spironolactone, ferritin/iron, distinct
// biotin. Many also report being "too overwhelmed to start" — naming that
// option validates the woman who hasn't tried anything because she didn't
// know where to start.
const WOMEN_OPTIONS = [
  "Minoxidil (Rogaine for women)",
  "Spironolactone or other anti-androgen",
  "Nutrafol",
  "Hers / Vegamour / similar",
  "Hair loss shampoos",
  "Biotin or collagen supplements",
  "Iron / ferritin supplements",
  "Rosemary oil / scalp oils",
  "Dermarollers / dermastamps",
  "PRP or red-light therapy",
  "Dermatologist visits",
  "Nothing — felt too overwhelmed to start",
];

// "Nothing" is the exclusive label on men's funnel; women's exclusive label
// is the longer "Nothing — felt too overwhelmed to start" option (same
// semantic role: picking it clears all other selections).
const MEN_NOTHING = "Nothing";
const WOMEN_NOTHING = "Nothing — felt too overwhelmed to start";

export default function TreatmentsTried() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
  const OPTIONS = isWomen ? WOMEN_OPTIONS : MEN_OPTIONS;
  const NOTHING = isWomen ? WOMEN_NOTHING : MEN_NOTHING;
  const selected = answers.treatmentsTried ?? [];

  // "Nothing" is exclusive — picking it deselects everything else, and
  // picking anything else deselects Nothing. Prevents the contradictory
  // "I tried Nothing AND Minoxidil" state.
  const toggle = (label: string) => {
    lightHaptic();
    if (selected.includes(label)) {
      updateAnswers({ treatmentsTried: selected.filter((s) => s !== label) });
      return;
    }
    if (label === NOTHING) {
      updateAnswers({ treatmentsTried: [NOTHING] });
      return;
    }
    // Adding a non-Nothing option — strip Nothing if present.
    const withoutNothing = selected.filter((s) => s !== NOTHING);
    updateAnswers({ treatmentsTried: [...withoutNothing, label] });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>What have you tried?</h1>
        <p className={styles.subtitle}>Select all that apply.</p>
        <div className={styles.optionList}>
          {OPTIONS.map((label) => {
            const isSelected = selected.includes(label);
            return (
              <button
                key={label}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => toggle(label)}
              >
                <span>{label}</span>
                <span className={`${styles.optionCheck} ${isSelected ? styles.optionCheckActive : ""}`}>
                  {isSelected ? "✓" : ""}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.buttonRow}>
        <Button disabled={selected.length === 0} onClick={next}>
          Continue
        </Button>
      </div>
    </div>
  );
}
