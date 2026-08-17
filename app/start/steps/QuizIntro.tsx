"use client";

// Direct port of quiz_intro.dart.
// Left-aligned text vertically centered. Fades in (opacity 0→1 + slide up 20px),
// holds for ~2.2s, then fades out before advancing to the next step.
import { useEffect, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig, practiceTerm } from "../lib/funnel-config";
import styles from "./quiz-intro.module.css";

export default function QuizIntro() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  const term = practiceTerm(config.audience, answers.gender);
  // Women's funnels handle the story → quiz handoff inside the creator
  // beat 6 ("Let me ask you a few quick questions to see if scalp massages
  // could help you?"). Auto-skip the generic brand-voice intro so we don't
  // double-prompt and break the creator's voice continuity.
  const skip = config.audience === "women";
  const [phase, setPhase] = useState<"in" | "hold" | "out">("in");

  useEffect(() => {
    if (skip) {
      next();
      return;
    }
    // 2.2s total: 500ms fade-in, 1000ms hold, 600ms fade-out, then advance.
    const inTimer = setTimeout(() => setPhase("hold"), 500);
    const outTimer = setTimeout(() => setPhase("out"), 1600);
    const advanceTimer = setTimeout(() => next(), 2200);
    return () => {
      clearTimeout(inTimer);
      clearTimeout(outTimer);
      clearTimeout(advanceTimer);
    };
  }, [next, skip]);

  if (skip) return null;

  return (
    <div className={styles.root}>
      <div className={styles.body}>
        <h1 className={`${styles.headline} ${styles[phase]}`}>
          {`Let's see if ${term}\ncan help you.`}
        </h1>
      </div>
    </div>
  );
}
