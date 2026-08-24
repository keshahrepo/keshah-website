"use client";

// Direct port of moment_build_your_plan.dart.
// Cinematic beat that opens the quiz block on desktop — follows the result
// screenshots (proof) and precedes the quiz proper, telling the user we're
// pivoting from "here's what's possible" to "here's what we need from you
// to build yours." Same visual as QuizIntro (both use the mobile QuizMoment
// widget), so we reuse quiz-intro.module.css instead of duplicating it.
//
// Both genders see this. No data captured — pure transition beat.

import { useEffect, useState } from "react";
import { useFlow } from "../lib/flow-context";
import styles from "./quiz-intro.module.css";

export default function MomentBuildYourPlan() {
  const { next } = useFlow();
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  const [advanced, setAdvanced] = useState(false);

  useEffect(() => {
    // Matches QuizIntro pacing: 500ms fade-in, 1000ms hold, 600ms fade-out,
    // then advance. Kept in sync with QuizIntro so successive QuizMoment
    // beats feel like the same beat, not two different transitions.
    const inTimer = setTimeout(() => setPhase("hold"), 500);
    const outTimer = setTimeout(() => setPhase("out"), 1600);
    const advanceTimer = setTimeout(() => {
      setAdvanced(true);
      next();
    }, 2200);
    return () => {
      clearTimeout(inTimer);
      clearTimeout(outTimer);
      clearTimeout(advanceTimer);
    };
  }, [next]);

  // Tap anywhere to skip forward if the user reads faster than the auto-
  // advance timer — mirrors the GestureDetector on the mobile QuizMoment.
  const handleSkip = () => {
    if (advanced) return;
    setAdvanced(true);
    setPhase("out");
    // Small tail so the fade-out registers before we swap the screen.
    setTimeout(() => next(), 300);
  };

  return (
    <div className={styles.root} onClick={handleSkip}>
      <div className={styles.body}>
        <h1 className={`${styles.headline} ${styles[phase]}`}>
          Let&apos;s build your plan.
        </h1>
      </div>
    </div>
  );
}
