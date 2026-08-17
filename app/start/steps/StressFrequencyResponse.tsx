"use client";

// Educational interstitial after StressFrequency. Single universal text
// (no branching — stress mechanism is the same regardless of self-reported
// frequency). Names cortisol + scalp muscle tension to give clinical
// anchor before personalized diagnosis. Auto-skips on men.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function StressFrequencyResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>
          Stress raises cortisol, which tightens the muscles in your scalp. Over months and years, that tension restricts blood flow to your hair follicles. It&apos;s why so many women notice thinning after a difficult period, even when nothing else seems wrong.
        </p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
