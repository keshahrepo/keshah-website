"use client";

// Walkthrough page #3 — shows the regrowth kit upgrade path. Positioned as
// optional ("when you're ready") so it doesn't push too hard, but plants
// the future-state seed: this isn't just stop-loss, you can grow hair back.

import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import StepHeader from "../components/StepHeader";
import startStyles from "../start.module.css";
import frame from "./app-preview.module.css";

export default function RegrowthKitPreview() {
  const { next, back } = useFlow();
  const handleContinue = () => {
    mediumHaptic();
    next();
  };
  return (
    <div className={startStyles.stepBody}>
      <StepHeader onBack={back} />
      <div className={startStyles.stepInner} style={{ alignItems: "center", textAlign: "center" }}>
        <p className={frame.label}>WHEN YOU&apos;RE READY</p>
        <h1 className={startStyles.headline} style={{ marginTop: 8, fontSize: 26 }}>
          Once your shedding stops, you can start growing it back.
        </h1>
        <p className={startStyles.subtitle} style={{ marginTop: 8, maxWidth: 400 }}>
          The optional kit takes 1 session a week. Most members add it around month 3.
        </p>
        <div className={frame.phone}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/start/app/regrowth_kit.jpeg" alt="KESHAH regrowth kit" className={frame.screenshot} />
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
