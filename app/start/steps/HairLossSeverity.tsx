"use client";

// Men's severity question with the social-context subtitles that make
// emotional reality concrete. Stolen straight from Hims because the
// "obvious to everyone" / "those close notice" / "only I notice" framing
// reflects how men actually think about their loss — by who else sees it.
//
// Auto-skips on women.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";

const OPTIONS = [
  { id: "alittle", label: "A little", sub: "Only I notice" },
  { id: "some", label: "Some", sub: "Those close to me notice" },
  { id: "alot", label: "A lot", sub: "It's obvious to everyone" },
];

export default function HairLossSeverity() {
  const { answers, updateAnswers, next, back } = useFlow();
  // Renders for both genders now — Hers ships this question to women too
  // ("How noticeable are the changes to your hair?") and the social-context
  // subtitles work just as well for female hair-thinning self-assessment.
  void useFunnelConfig();

  const selected = answers.hairLossSeverity ?? "";

  const handlePick = (id: string) => {
    lightHaptic();
    updateAnswers({ hairLossSeverity: id });
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>How much hair have you lost?</h1>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => handlePick(opt.id)}
                style={{ alignItems: "flex-start", padding: "16px 20px" }}
              >
                <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                  <span style={{ fontSize: 15, fontWeight: 600 }}>{opt.label}</span>
                  <span style={{ fontSize: 13, color: "var(--fg-55)", fontWeight: 400 }}>
                    {opt.sub}
                  </span>
                </span>
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
