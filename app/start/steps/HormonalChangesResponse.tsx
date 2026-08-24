"use client";

// Women-only reassurance interstitial after HormonalChanges. Only shown
// when the user reported a real hormonal shift (postpartum / menopause /
// birth_control) — 'none' / 'not_sure' auto-skip via the useEffect below
// (mirrors the mobile pageMap conditional). Reframes the hormonal driver
// into scalp tension (the addressable part) without overpromising a
// hormonal reset.
//
// Auto-skips on men (women-only beat per mobile source of truth).

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

// Ids that mean a real hormonal shift the reassurance is aimed at. Any
// other stored value ('none' / 'not_sure' / undefined) skips the beat.
const REAL_SHIFTS = new Set(["postpartum", "menopause", "birth_control"]);

export default function HormonalChangesResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
  const hormonalId = (answers as { hormonalChanges?: string }).hormonalChanges;
  const shouldShow = isWomen && REAL_SHIFTS.has(hormonalId ?? "");

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
          Your routine won&apos;t reset your hormones, but it will help fix the scalp tension that shows up alongside them. Most women see results without ever having to touch their hormones.
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
