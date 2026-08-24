"use client";

// Women-only reassurance interstitial after TightHairstyles. Only shown
// when the user reported daily / frequent tight styling — 'rarely' auto-
// skips this page (matches the conditional pageMap entry in the mobile
// flow). Ties traction into the same scalp-tension mechanism the routine
// addresses so the user sees the routine as the direct fix.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function TightHairstylesResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
  const tightHairstyles = answers.tightHairstyles;
  const shouldShow =
    isWomen && (tightHairstyles === "daily" || tightHairstyles === "sometimes");

  useEffect(() => {
    if (!shouldShow) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldShow]);

  if (!shouldShow) return null;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>
          Constant pulling can put extra physical stress on your scalp. Your
          routine will help release that stress so your follicles can breathe
          again.
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
