"use client";

// Unified response for all three hair-goal answers (stop / regrow / both).
// One message works for everyone because the protocol is the same regardless:
// stop the loss first, then regrow as part of the treatment. The "if you'd
// like to regrow" framing addresses the regrow/both users naturally without
// requiring separate variants.
import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function GoalResponse() {
  const { next } = useFlow();

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>
          In about 60 days, most members stop their hair loss. If you&apos;d
          like to regrow new hair, we&apos;ll make recommendations in the
          treatment.
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
