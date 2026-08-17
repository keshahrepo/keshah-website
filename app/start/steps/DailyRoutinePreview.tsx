"use client";

// App-preview slide #1 — today's-routine home screen. Stripped to a single
// small "HOW IT WORKS" label + one short subline + the screenshot. The
// screenshot does the persuasion; copy stays out of the way.

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import startStyles from "../start.module.css";
import frame from "./app-preview.module.css";

export default function DailyRoutinePreview() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
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
          {isWomen
            ? "Set aside 20 minutes. Follow the day's massages."
            : "Set aside 20 minutes. Follow the day's exercises."}
        </h1>
        <div className={frame.phone}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/start/app/daily_routine.jpeg" alt="KESHAH app — today's routine" className={frame.screenshot} />
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
