"use client";

// Universal reframe interstitial after FamilyHistory (shown to both
// genders — mobile class name kept "Men" for continuity). Takes the
// "it's genetic, nothing you can do" fatalism and reframes it with the
// gene expression research: physical stimulation can up-regulate hair
// growth genes and down-regulate hair loss genes.
//
// Only lands for users who answered Yes or Maybe — No / Not sure auto-
// skip via the effect below so we don't argue against a non-belief
// (mirrors the conditional pageMap entry in the mobile flow).
//
// Language flexes on gender: men see "scalp exercises", women see
// "scalp massages" — matching the vocabulary the two audiences use for
// the same routine everywhere else in the flow.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function FamilyHistoryMenResponse() {
  const { answers, next } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
  const word = isWomen ? "massages" : "exercises";

  // Mobile only pushes this page onto the flow when familyHistory is
  // "yes" or "maybe"; on the web the step is always in STEP_ORDER, so
  // we replicate the gate here by auto-forwarding on no / not_sure /
  // missing (defensive — if the user somehow lands here without an
  // answer, don't strand them on a page whose framing assumes belief).
  const familyHistory = answers.familyHistory;
  const shouldShow = familyHistory === "yes" || familyHistory === "maybe";

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
          Hair loss patterns often repeat in families, but your genetics aren&apos;t set in stone.
        </p>
        <p className={styles.text} style={{ marginTop: "18px" }}>
          When I dug into the research, I found something wild: scalp stimulation through {word} can actually change gene expression, turning on genes tied to hair growth and turning off ones tied to hair loss.
          <sup style={{ fontSize: "0.6em", verticalAlign: "super", lineHeight: 0, marginLeft: "1px" }}>1</sup>
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
          In one clinical study, standardized scalp stimulation up-regulated 2,655 genes and down-regulated 2,823, with increases in hair cycle-related genes and decreases in hair loss-related genes.
          <br />
          Koyama et al., 2016 &middot; English &amp; Barman, 2019
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
