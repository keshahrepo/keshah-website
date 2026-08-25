"use client";

/**
 * BuildingYourPlanStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/building_your_plan.dart
 *
 * ~10s scripted loader between the last quiz step and the plan reveal.
 * Four tick-off lines fill in one-by-one at uneven cadences (so it reads
 * as real work rather than a metronome) while a linear progress bar
 * lands 100% exactly as the last check appears. A short hold then
 * auto-advances via useFlow().next().
 *
 * Timings translated 1:1 from the Flutter controllers:
 *   - Header fade: 500ms easeOut
 *   - Initial delay before ticks: 700ms
 *   - Per-tick delays: 1300 / 2600 / 1700 / 2900 ms
 *   - Hold after last tick before advancing: 900ms
 *   - Total dwell: 700 + 1300 + 2600 + 1700 + 2900 + 900 = 10100ms
 *
 * Writes nothing to Firestore. Linear (no branching). Shown to both genders.
 */

import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { colors } from "../lib/tokens";

const STEPS = [
  "Reviewing your pinch test",
  "Setting up your focus area",
  "Building your daily routine",
  "Scheduling your follow-up",
] as const;

// Per-step delays are intentionally uneven so the loader doesn't read
// as a stopwatch. Steps 2 and 4 take longer because they suggest
// "harder" work (mapping / scheduling) than the analyze / set steps.
const TICK_DELAYS_MS = [1300, 2600, 1700, 2900] as const;
const INITIAL_DELAY_MS = 700;
const HOLD_BEFORE_ADVANCE_MS = 900;
const TICK_WINDOW_MS = TICK_DELAYS_MS.reduce((a, b) => a + b, 0); // 8500
const TOTAL_DURATION_MS =
  INITIAL_DELAY_MS + TICK_WINDOW_MS + HOLD_BEFORE_ADVANCE_MS;

export default function BuildingYourPlanStep() {
  const { next } = useFlow();
  const [completed, setCompleted] = useState(0);
  const [progress, setProgress] = useState(0); // 0..1
  const rafRef = useRef<number | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const timers: number[] = [];

    // Drive the progress bar via requestAnimationFrame, mapping elapsed
    // time within the tick window through the same easeOut-per-segment
    // TweenSequence the Flutter controller uses (25% per tick, easing
    // inside each segment so the bar accelerates/decelerates per tick
    // rather than crawling linearly out of sync with them).
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const segmentBoundaries: number[] = [0];
    for (let i = 0; i < TICK_DELAYS_MS.length; i++) {
      segmentBoundaries.push(segmentBoundaries[i] + TICK_DELAYS_MS[i]);
    }
    const barStart = performance.now() + INITIAL_DELAY_MS;
    const tick = () => {
      const now = performance.now();
      const elapsed = now - barStart;
      if (elapsed <= 0) {
        setProgress(0);
      } else if (elapsed >= TICK_WINDOW_MS) {
        setProgress(1);
        return; // stop the RAF loop once we've landed at 100%
      } else {
        // Find which segment we're in, then ease within it.
        let seg = 0;
        for (let i = 0; i < TICK_DELAYS_MS.length; i++) {
          if (elapsed < segmentBoundaries[i + 1]) {
            seg = i;
            break;
          }
        }
        const segStart = segmentBoundaries[seg];
        const segLen = TICK_DELAYS_MS[seg];
        const local = (elapsed - segStart) / segLen; // 0..1
        const eased = easeOut(local);
        const value = (seg + eased) / TICK_DELAYS_MS.length;
        setProgress(value);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);

    // Fire each tick after its own cumulative delay so cadence varies.
    let cumulative = INITIAL_DELAY_MS;
    for (let i = 0; i < STEPS.length; i++) {
      cumulative += TICK_DELAYS_MS[i];
      const at = cumulative;
      const idx = i;
      timers.push(
        window.setTimeout(() => {
          setCompleted(idx + 1);
        }, at)
      );
    }

    // Auto-advance once all four ticks + short hold have elapsed.
    timers.push(
      window.setTimeout(() => {
        next();
      }, TOTAL_DURATION_MS)
    );

    return () => {
      timers.forEach((t) => window.clearTimeout(t));
      if (rafRef.current != null) window.cancelAnimationFrame(rafRef.current);
    };
    // Intentionally run once on mount; next is stable via useCallback in
    // FlowProvider and we don't want the scheduled sequence to reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const percent = Math.round(Math.min(1, Math.max(0, progress)) * 100);
  const barWidthFactor = Math.max(0.02, Math.min(1, progress));

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: colors.black,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 32px",
        }}
      >
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, ease: [0, 0, 0.58, 1] }}
          style={{ display: "flex", justifyContent: "flex-start" }}
        >
          <h1
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 26,
              fontWeight: 600,
              color: colors.white,
              letterSpacing: -1.2,
              lineHeight: 1.3,
              margin: 0,
              whiteSpace: "nowrap",
            }}
          >
            Building your plan
          </h1>
        </motion.div>

        <div style={{ height: 24 }} />

        {/* Progress bar row: track + fill + right-aligned fixed-width % */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <div style={{ flex: 1, position: "relative", height: 6 }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(255,255,255,0.08)",
                borderRadius: 3,
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                bottom: 0,
                width: `${barWidthFactor * 100}%`,
                background: colors.white,
                borderRadius: 3,
              }}
            />
          </div>
          <div style={{ width: 8 }} />
          <div
            style={{
              width: 34,
              textAlign: "right",
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 13,
              fontWeight: 600,
              color: colors.white,
              letterSpacing: -0.2,
            }}
          >
            {percent}%
          </div>
        </div>

        <div style={{ height: 20 }} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "stretch",
          }}
        >
          {STEPS.map((label, i) => {
            const isDone = i < completed;
            return (
              <div
                key={label}
                style={{
                  padding: "8px 0",
                  display: "flex",
                  alignItems: "center",
                  opacity: isDone ? 1 : 0.35,
                  transition: "opacity 400ms ease",
                }}
              >
                <div
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 11,
                    background: isDone ? "#359033" : "rgba(255,255,255,0.06)",
                    border: `1.4px solid ${
                      isDone ? "#359033" : "rgba(255,255,255,0.25)"
                    }`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition:
                      "background 300ms ease, border-color 300ms ease",
                    flexShrink: 0,
                  }}
                >
                  {isDone && (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M5 12.5l4.5 4.5L19 7.5"
                        stroke={colors.white}
                        strokeWidth="2.6"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                </div>
                <div style={{ width: 14 }} />
                <div
                  style={{
                    flex: 1,
                    fontFamily: "Poppins, -apple-system, sans-serif",
                    fontSize: 15,
                    fontWeight: 500,
                    color: colors.white,
                    lineHeight: 1.35,
                    letterSpacing: -0.2,
                  }}
                >
                  {label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
