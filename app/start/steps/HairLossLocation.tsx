"use client";

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { HairLossLocation as HairLossLocationId } from "../lib/types";

// Men's options unchanged — crown / hairline / all-over are the universal
// male-pattern locations. Women's set drops "crown" (which is a male-pattern
// presentation rarely seen in women) and uses Hers-aligned phrasing —
// "widening part" is the #1 thing women actually notice and Google.
const MEN_OPTIONS: { id: HairLossLocationId; label: string }[] = [
  { id: "crown", label: "Crown" },
  { id: "hairline", label: "Hairline" },
  { id: "all_over", label: "All over" },
];

const WOMEN_OPTIONS: { id: HairLossLocationId; label: string }[] = [
  { id: "part", label: "Widening part" },
  { id: "hairline", label: "Around my hairline / temples" },
  { id: "all_over", label: "Overall thinning" },
];

export default function HairLossLocation() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
  const OPTIONS = isWomen ? WOMEN_OPTIONS : MEN_OPTIONS;
  const selected = answers.hairLossLocation;

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>{"Where are you\nlosing hair?"}</h1>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => {
                  lightHaptic();
                  updateAnswers({ hairLossLocation: opt.id });
                }}
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
