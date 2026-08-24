"use client";

// Direct port of moment_check_your_scalp.dart.
// Cinematic beat that primes the pinch test — sits between the founder
// story and the pinch test itself so the transition feels intentional
// rather than jumping straight into an interactive test.
//
// Same auto-advancing QuizMoment pattern as QuizIntro: left-aligned text
// vertically centered, fades in (opacity 0→1 + slide up 20px), holds
// briefly, then fades out before advancing. Reuses quiz-intro.module.css
// so any future timing/type tweaks stay in one place.
//
// No Firestore writes and no gender branching — purely a transition beat.

import { useEffect, useState } from "react";
import { useFlow } from "../lib/flow-context";
import styles from "./quiz-intro.module.css";

export default function MomentCheckYourScalp() {
  const { next } = useFlow();
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    // 2.2s total: 500ms fade-in, 1000ms hold, 600ms fade-out, then advance.
    const inTimer = setTimeout(() => setPhase("hold"), 500);
    const outTimer = setTimeout(() => setPhase("out"), 1600);
    const advanceTimer = setTimeout(() => next(), 2200);
    return () => {
      clearTimeout(inTimer);
      clearTimeout(outTimer);
      clearTimeout(advanceTimer);
    };
  }, [next]);

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <h1 className={`${styles.headline} ${styles[phase]}`}>
          {`Let's check your scalp.`}
        </h1>
      </div>
    </div>
  );
}
