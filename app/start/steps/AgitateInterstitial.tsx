"use client";

// PAS Agitate moment — Hims-style interstitial that names the root causes
// the user just admitted to (aging, family history, stress) and pivots to
// "the good news: here's what KESHAH does about it." Sits between the
// lifestyle questions and the treatments-tried section. Frames the
// upcoming treatment list as "everything else couldn't fix this — let's
// see what you've tried" rather than a generic checklist.
//
// Auto-skips on women — they have their own validation arc via the
// triggerContext step.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import Button from "../components/Button";
import StepHeader from "../components/StepHeader";
import { mediumHaptic } from "../lib/haptics";
import styles from "../start.module.css";

export default function AgitateInterstitial() {
  const { answers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isMen = config.audience !== "women" && answers.gender !== "female";

  useEffect(() => {
    if (!isMen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMen]);

  if (!isMen) return null;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.stepBody}>
      <StepHeader onBack={back} />
      <div
        className={styles.stepInner}
        style={{ justifyContent: "center", paddingBottom: 64 }}
      >
        <p
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: 1.5,
            textTransform: "uppercase",
            color: "var(--fg-50)",
            margin: 0,
            marginBottom: 16,
          }}
        >
          A quick reality check
        </p>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            lineHeight: 1.3,
            letterSpacing: "-0.6px",
            margin: 0,
          }}
        >
          Genetics, age, and stress all do the same thing to your scalp —
          they make it tight.
        </h1>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--fg-65)",
            marginTop: 18,
          }}
        >
          A tight scalp squeezes the blood vessels that feed your hair.
          Less blood, weaker hair, more shedding.
        </p>
        <p
          style={{
            fontSize: 16,
            lineHeight: 1.55,
            color: "var(--fg-65)",
            marginTop: 18,
          }}
        >
          The good news: scalp tightness is reversible. Without drugs,
          without surgery, without side effects.
        </p>
      </div>
      <div className={styles.buttonRow}>
        <Button onClick={handleContinue}>Continue</Button>
      </div>
    </div>
  );
}
