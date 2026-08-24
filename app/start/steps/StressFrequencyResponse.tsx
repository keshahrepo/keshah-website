"use client";

// Educational interstitial after StressFrequency. Single universal text
// (no branching — stress mechanism is the same regardless of self-reported
// frequency). Names fight-or-flight + scalp muscle tension to give the
// clinical anchor before personalized diagnosis, then closes with
// KESHAH-as-fix + reassurance and a numbered citation footer. Auto-skips
// on men.

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
          When you&apos;re stressed, your body activates the &ldquo;fight or flight&rdquo; response and your scalp muscles tighten up.<sup style={{ fontSize: "0.6em", verticalAlign: "super", lineHeight: 0, marginLeft: "1px" }}>1</sup> KESHAH releases that tension and restores the blood flow your hair needs to grow.
        </p>
        <p className={styles.text} style={{ marginTop: "18px" }}>
          You can&apos;t always remove stress from your life, but you can undo its physical impact on your hair.
        </p>
        <p
          style={{
            marginTop: "28px",
            fontSize: "12px",
            lineHeight: 1.5,
            color: "var(--text)",
            opacity: 0.55,
            fontWeight: 400,
            letterSpacing: 0,
          }}
        >
          <sup style={{ fontSize: "0.85em", verticalAlign: "super", lineHeight: 0, marginRight: "2px" }}>1</sup>
          Mental stress can increase muscle activity. Scalp muscles can transmit mechanical force into the scalp.
          <br />
          Lundberg et al., 1994 &middot; Tellez-Segura, 2015
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
