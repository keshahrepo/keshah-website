"use client";

// Loading interstitial that sits between Commitment and PersonalizedDiagnosis.
// ~10 seconds total — long enough to make the diagnosis feel computed, not
// pre-written, and to let a four-step tick-off list echo the quiz signals we
// just captured. A thin progress bar fills from 0 to 100% with a live
// percentage readout. Auto-advances to PersonalizedDiagnosis when complete;
// no skip button — the wait IS the work.
//
// Pattern stolen from Noom / Flo / Hers / Nutrafol. Investment ratification:
// the user just answered ~10 questions, the loader signals "we're using
// your data right now," so the personalization on the next page feels
// earned. Each tick maps to a specific quiz signal so the ratification is
// concrete, not decorative.

import { useEffect, useState } from "react";
import { useFlow } from "../lib/flow-context";
import startStyles from "../start.module.css";

// Mirrors the mobile source of truth: initial delay 700ms, then four ticks
// land at 1300 / 2600 / 1700 / 2900ms, then a 900ms hold before advance.
const INITIAL_DELAY_MS = 700;
const TICK_DELAYS_MS = [1300, 2600, 1700, 2900];
const HOLD_MS = 900;
const DURATION_MS =
  INITIAL_DELAY_MS +
  TICK_DELAYS_MS.reduce((a, b) => a + b, 0) +
  HOLD_MS;

// Four labeled steps that each map to a captured quiz signal. Ordered to
// match the mobile source of truth.
const STEPS = [
  "Reviewing your pinch test",
  "Setting up your focus area",
  "Building your daily routine",
  "Scheduling your follow-up",
];

export default function DiagnosisLoading() {
  const { next } = useFlow();
  const [completedCount, setCompletedCount] = useState(0);
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    // Schedule the four tick-offs at cumulative offsets from t=0.
    const timers: number[] = [];
    let cumulative = INITIAL_DELAY_MS;
    TICK_DELAYS_MS.forEach((delay, i) => {
      cumulative += delay;
      timers.push(
        window.setTimeout(() => setCompletedCount(i + 1), cumulative)
      );
    });

    // Drive the percentage readout with rAF so it feels like real work,
    // matched to the same DURATION_MS the progress bar animates over.
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      const p = Math.min(100, Math.round((elapsed / DURATION_MS) * 100));
      setPercent(p);
      if (elapsed < DURATION_MS) {
        raf = window.requestAnimationFrame(tick);
      }
    };
    raf = window.requestAnimationFrame(tick);

    const advanceTimer = window.setTimeout(() => next(), DURATION_MS);
    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      window.clearTimeout(advanceTimer);
      window.cancelAnimationFrame(raf);
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
      <div style={{ width: "100%", maxWidth: 360 }}>
        {/* Ratifying headline — mirrors the mobile 'Building your plan'
            title above the progress bar. */}
        <h1
          style={{
            fontSize: 28,
            lineHeight: 1.2,
            fontWeight: 600,
            color: "var(--text)",
            margin: "0 0 24px",
            textAlign: "center",
          }}
        >
          Building your plan
        </h1>

        {/* Progress bar + live percentage. Bar fills from 0 to 100% over
            DURATION_MS via CSS animation. Easing is linear so it feels
            like real computation, not a designed transition. The percent
            label to the right is driven by rAF against the same duration
            so the two readouts stay in lockstep. */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 32,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 3,
              background: "var(--fg-10)",
              borderRadius: 2,
              overflow: "hidden",
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
          <span
            style={{
              fontSize: 14,
              color: "var(--fg-75)",
              fontVariantNumeric: "tabular-nums",
              minWidth: 36,
              textAlign: "right",
            }}
          >
            {percent}%
          </span>
        </div>

        {/* Four-step tick-off list. Each row flips from a pending dot to
            a checkmark as its stage completes, echoing the specific quiz
            signals the user just gave us. */}
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          {STEPS.map((label, i) => {
            const done = i < completedCount;
            return (
              <li
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 16,
                  color: done ? "var(--text)" : "var(--fg-50)",
                  transition: "color 300ms ease-out",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: done ? "var(--text)" : "transparent",
                    border: done ? "none" : "1.5px solid var(--fg-25)",
                    color: "var(--bg)",
                    flexShrink: 0,
                    transition: "background 300ms ease-out, border 300ms ease-out",
                  }}
                >
                  {done ? (
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 10 10"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1.5 5.2 L4 7.5 L8.5 2.5"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : null}
                </span>
                <span>{label}</span>
              </li>
            );
          })}
        </ul>
      </div>
      <style jsx>{`
        @keyframes diagLoadFill {
          from { transform: scaleX(0); }
          to { transform: scaleX(1); }
        }
      `}</style>
    </div>
  );
}
