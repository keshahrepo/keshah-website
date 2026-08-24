"use client";

// Direct port of moment_here_is_what_happens.dart.
// Cinematic beat right after the pinch test — sets up the mechanism reveal
// that follows by teasing "when your scalp loosens" without giving away the
// payoff. Both genders see this (matches mobile flow).
//
// Same shell as QuizIntro (both mobile files wrap the shared QuizMoment
// widget) — text fades in + slides up 20px, holds briefly, then fades out
// and auto-advances. Tap anywhere to skip forward if the user reads faster
// than the timer.
import { useCallback, useEffect, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import styles from "./quiz-intro.module.css";

export default function MomentHereIsWhatHappens() {
  const { next } = useFlow();
  // "in" starts hidden then transitions to hold; "hold" is the visible plateau;
  // "out" reverses the slide + fade before we call next(). Matches the mobile
  // controller.forward() → hold → controller.reverse() sequence.
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");
  // Guard so tap-to-skip and the auto-advance timer can't both fire next().
  const advancedRef = useRef(false);

  const advance = useCallback(() => {
    if (advancedRef.current) return;
    advancedRef.current = true;
    next();
  }, [next]);

  useEffect(() => {
    // Timings match QuizIntro's port (500ms fade-in, 1000ms hold, 600ms
    // fade-out) so both moments feel like the same beat.
    const inTimer = setTimeout(() => setPhase("hold"), 500);
    const outTimer = setTimeout(() => setPhase("out"), 1600);
    const advanceTimer = setTimeout(advance, 2200);
    return () => {
      clearTimeout(inTimer);
      clearTimeout(outTimer);
      clearTimeout(advanceTimer);
    };
  }, [advance]);

  // Tap anywhere to skip forward. Kick off the fade-out first if we haven't
  // already started it, then let the same advance() run when the transition
  // finishes so the exit still feels smooth.
  const handleTap = () => {
    if (phase !== "out") {
      setPhase("out");
      setTimeout(advance, 300);
    } else {
      advance();
    }
  };

  return (
    <div className={styles.root} onClick={handleTap} role="button" tabIndex={0}>
      <div className={styles.body}>
        <h1 className={`${styles.headline} ${styles[phase]}`}>
          Here&apos;s what happens when your scalp loosens.
        </h1>
      </div>
    </div>
  );
}
