"use client";

// Direct port of disqualification_screen.dart.
// Full-screen with centered message + subtext, sticky white "Go back" button.
import { mediumHaptic } from "../lib/haptics";
import styles from "./disqualification.module.css";

interface Props {
  message: string;
  /** Optional secondary explanation. Omit when the message is self-contained. */
  subtext?: string;
  onGoBack: () => void;
}

export default function DisqualificationScreen({ message, subtext, onGoBack }: Props) {
  const handleGoBack = () => {
    mediumHaptic();
    onGoBack();
  };

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <h1 className={styles.message}>{message}</h1>
        {subtext && <p className={styles.subtext}>{subtext}</p>}
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleGoBack}>
          Go back
        </button>
      </div>
    </div>
  );
}
