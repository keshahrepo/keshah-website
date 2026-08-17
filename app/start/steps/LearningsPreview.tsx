"use client";

// App-preview slide #3 — day-by-day learnings library. Anchors the "you're
// not alone, you have a guide" promise: every question they'll have, with
// Aadi answering them across the 18-day learning track.

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import startStyles from "../start.module.css";
import frame from "./app-preview.module.css";

export default function LearningsPreview() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  // Women's funnel: the daily learnings preview is the third repetitive
  // "HOW IT WORKS" screen and adds little after Daily Routine + Video
  // Session. Auto-skip on women. Men's funnel keeps it.
  const skip = config.audience === "women" || answers.gender === "female";
  useEffect(() => {
    if (skip) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);
  if (skip) return null;
  const handleContinue = () => {
    mediumHaptic();
    next();
  };
  return (
    <div className={startStyles.stepBody}>
      <div
        className={startStyles.stepInner}
        style={{
          alignItems: "center",
          textAlign: "center",
          paddingTop: "calc(env(safe-area-inset-top) + 56px)",
        }}
      >
        <p className={frame.label}>HOW IT WORKS</p>
        <h1 className={startStyles.headline} style={{ marginTop: 8, fontSize: 26 }}>
          Every question you have about your hair loss answered.
        </h1>
        <div className={frame.phone}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/start/app/learnings.jpeg" alt="KESHAH app — your learnings, day by day" className={frame.screenshot} />
        </div>
      </div>
      <div className={startStyles.buttonRow}>
        <button type="button" className={startStyles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
