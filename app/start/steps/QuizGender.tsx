"use client";

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { fbqTrackOnce } from "../lib/fb-pixel";
import { lightHaptic } from "../lib/haptics";
import styles from "../start.module.css";
import type { Gender } from "../lib/types";

const OPTIONS: { id: Gender; label: string }[] = [
  { id: "male", label: "Male" },
  { id: "female", label: "Female" },
];

export default function QuizGender() {
  const { answers, updateAnswers, next, back } = useFlow();
  const config = useFunnelConfig();
  const selected = answers.gender;

  // Auto-skip on funnels with a locked audience (women's creator funnels,
  // /mandy). The user has already self-identified by clicking through the
  // creator's bio link; asking again breaks coherence and adds friction.
  // Pre-fills the gender so downstream personalization (LocationResponse,
  // diagnosis factors, result clips) still routes correctly.
  useEffect(() => {
    if (config.audience === "women" && answers.gender !== "female") {
      updateAnswers({ gender: "female" });
      fbqTrackOnce("Lead");
      next();
    } else if (config.audience === "men" && answers.gender !== "male") {
      updateAnswers({ gender: "male" });
      fbqTrackOnce("Lead");
      next();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config.audience]);

  if (config.audience === "women" || config.audience === "men") return null;

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div className={styles.stepInner}>
        <h1 className={styles.headline}>What&apos;s your gender?</h1>
        <div className={styles.optionList}>
          {OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
                onClick={() => {
                  lightHaptic();
                  updateAnswers({ gender: opt.id });
                  // Facebook Lead event — fires once per session. Picking
                  // a gender is the first meaningful commitment to the
                  // funnel, so this is the right Lead trigger.
                  // (TikTok has no Lead standard event — its funnel
                  // signal comes from ViewContent → InitiateCheckout
                  // → CompleteRegistration / Purchase.)
                  fbqTrackOnce("Lead");
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
