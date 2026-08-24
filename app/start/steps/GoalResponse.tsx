"use client";

// Body copy branches on the user's hair goal (stop_the_loss / regrow_hair /
// both) with three distinct messages, mirroring the mobile app's _bodyText
// switch. The routine noun also swaps on gender — women see "scalp massages"
// and men see "scalp exercises" — matching the mobile terminology split.
import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import styles from "./response.module.css";

export default function GoalResponse() {
  const { answers, next } = useFlow();

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  const routineWord = answers.gender === "female" ? "massages" : "exercises";

  const bodyText = (() => {
    switch (answers.hairGoal) {
      case "regrow_hair":
        return `KESHAH first stops your hair loss with scalp ${routineWord}. Once that's under control, you can add our optional microneedling add-on in the app to regrow new hair in bald areas.`;
      case "both":
        return `Scalp ${routineWord} help stop hair loss and maintain long-term. Once you're ready to regrow new hair in bald areas, you can add our optional microneedling add-on in the app.`;
      case "stop_the_loss":
      default:
        return `Perfect. Scalp ${routineWord} will stop your hair loss and help maintain it long-term.`;
    }
  })();

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <p className={styles.text}>{bodyText}</p>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
