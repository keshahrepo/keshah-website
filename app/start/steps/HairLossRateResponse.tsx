"use client";

// Educational interstitial after HairLossRate (Hims-style). Branches on
// sudden / gradual / not-sure to give a clinical-but-warm explanation of
// what each answer typically means. Builds belief in the mechanism before
// the user reaches the personalized diagnosis page. Auto-skips on men.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function HairLossRateResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const rate = answers.hairLossRate;
  const text = (() => {
    switch (rate) {
      case "Suddenly":
        return (
          <>
            Sudden hair loss is usually triggered by an event. Childbirth, illness, surgery, or a stressful period can all cause shedding 2-3 months later. The medical term is telogen effluvium. It&apos;s also one of the most reversible types — once the underlying cause is addressed, hair typically returns.
          </>
        );
      case "Gradually":
        return (
          <>
            Gradual hair loss usually means scalp tension has been building for years. Stress, hormonal shifts, and chronic tight hairstyles tighten the scalp slowly over time. By the time it&apos;s visible, the tension has been there a while.
          </>
        );
      case "I'm not sure":
      default:
        return (
          <>
            Most hair loss creeps up gradually — slowly enough that women often don&apos;t realize when it started. The underlying cause is usually the same: scalp tension restricting blood flow over time.
          </>
        );
    }
  })();

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>{text}</p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
