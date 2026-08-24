"use client";

// "Can you commit 20 minutes daily?" with primary Yes button + outline No
// button (with two-line subtext "KESHAH may not be the right fit for you").
// "No" path shows the shared DisqualificationScreen.
//
// Hard gate intentionally kept — qualifies the prospect's commitment level
// before they hit the paywall. A user who picks "No, I can't" is too
// expensive to acquire and would churn anyway.
import { useState } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig, practiceTerm } from "../lib/funnel-config";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import DisqualificationScreen from "../components/DisqualificationScreen";
import styles from "./qualification.module.css";

export default function Commitment() {
  const { answers, updateAnswers, next } = useFlow();
  const config = useFunnelConfig();
  const term = practiceTerm(config.audience, answers.gender);
  const Term = term.charAt(0).toUpperCase() + term.slice(1);
  const [showDisqualified, setShowDisqualified] = useState(false);

  if (showDisqualified) {
    return (
      <DisqualificationScreen
        message={`${Term} might not be right for you right now.`}
        subtext="They need daily time and consistency to work."
        onGoBack={() => setShowDisqualified(false)}
      />
    );
  }

  const handleYes = () => {
    mediumHaptic();
    updateAnswers({ commitmentAnswer: "yes" });
    next();
  };

  const handleNo = () => {
    lightHaptic();
    setShowDisqualified(true);
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <h1 className={styles.headline}>KESHAH is not a quick fix. Can you commit 20 minutes a day?</h1>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.primary} onClick={handleYes}>
          Yes, I can commit
        </button>
        <button type="button" className={styles.outline} onClick={handleNo}>
          <span className={styles.outlineMain}>No, I can&apos;t</span>
          <span className={styles.outlineSub}>KESHAH may not be the right fit for you</span>
        </button>
      </div>
    </div>
  );
}
