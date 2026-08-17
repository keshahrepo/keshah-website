"use client";

// Loading interstitial that sits between Commitment and PersonalizedDiagnosis.
// Three seconds total — long enough to make the diagnosis feel computed, not
// pre-written; short enough not to feel manipulative. Three short subheads
// rotate (~1s each) and a thin progress bar fills from 0 to 100%. Auto-
// advances to PersonalizedDiagnosis when complete; no skip button — the
// wait IS the work.
//
// Pattern stolen from Noom / Flo / Hers / Nutrafol. Investment ratification:
// the user just answered ~10 questions, the loader signals "we're using
// your data right now," so the personalization on the next page feels
// earned.

import { useEffect, useState } from "react";
import { useFlow } from "../lib/flow-context";
import startStyles from "../start.module.css";

const DURATION_MS = 3000;

// One honest line. Earlier copy ("Matching to your scalp pattern…") implied
// scalp-data analysis we never collected — sharp users caught it as an
// over-claim. The diagnosis is computed from the quiz answers; the loader
// should say so plainly.
const STAGES = [
  "Reviewing your answers...",
];

export default function DiagnosisLoading() {
  const { next } = useFlow();
  const [stageIndex, setStageIndex] = useState(0);

  useEffect(() => {
    const stageDuration = DURATION_MS / STAGES.length;
    const stageTimers: number[] = [];
    for (let i = 1; i < STAGES.length; i++) {
      stageTimers.push(
        window.setTimeout(() => setStageIndex(i), i * stageDuration)
      );
    }
    const advanceTimer = window.setTimeout(() => next(), DURATION_MS);
    return () => {
      stageTimers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(advanceTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={startStyles.stepBody}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 32px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 360, textAlign: "center" }}>
        {/* Progress bar — fills from 0 to 100% over DURATION_MS via CSS
            animation. Easing is linear so it feels like real computation,
            not a designed transition. */}
        <div
          style={{
            width: "100%",
            height: 3,
            background: "var(--fg-10)",
            borderRadius: 2,
            overflow: "hidden",
            marginBottom: 24,
          }}
        >
          <div
            style={{
              height: "100%",
              background: "var(--text)",
              transformOrigin: "left center",
              animation: `diagLoadFill ${DURATION_MS}ms linear forwards`,
            }}
          />
        </div>
        <p
          key={stageIndex}
          style={{
            fontSize: 16,
            color: "var(--fg-75)",
            margin: 0,
            animation: "diagLoadFade 300ms ease-out",
          }}
        >
          {STAGES[stageIndex]}
        </p>
      </div>
      <style jsx>{`
        @keyframes diagLoadFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
        @keyframes diagLoadFade {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
