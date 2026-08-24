"use client";

// Direct port of moment_founder_flashback.dart.
// Cinematic personal moment right before the trial paywall. Aadi taps
// the reader on the shoulder by name ("One last thing, [Name]…"), then
// shares his week-one experience, then invites them in.
//
// Voice: continues Aadi's running conversation with the reader — no
// italics on the whole line, no attribution. Words wrapped in *asterisks*
// render italic for word-level emphasis (mirrors the mobile Text.rich
// split-on-`*` trick).
//
// Timing: each beat fades in (900ms), holds for a beat-specific duration
// (intro shortest, story longest because it has the most text), then
// fades out (900ms) before the next beat starts. Tap during a hold
// advances that beat only — doesn't skip the whole sequence — so an
// impatient reader can pace beat by beat instead of losing the moment
// on one tap.
//
// Paywall handoff: the final beat fades OUT before we call next(), so
// the screen briefly goes black before the paywall renders — a smooth
// cinematic dissolve rather than a hard page swap.
//
// No gender branching, no Firestore writes — purely a transition beat.
// Forces a black background (matches mobile kBlack) regardless of the
// funnel theme; the cinematic intent is the whole point of the beat.

import { useEffect, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { colors, font, letterSpacing, lineHeight } from "../lib/tokens";

// Per-beat hold durations in ms — matches the mobile _beatHolds list.
// Intro is shortest (setup, not peak). Beat 1 (the story line) has the
// most text so it gets the longest hold. Beat 2 (invitation) is shorter
// but still substantial so it lands before the paywall.
const BEAT_HOLDS_MS = [1200, 3500, 2800] as const;
const FADE_MS = 900;

type BeatPhase = "in" | "hold" | "out";

export default function MomentFounderFlashback() {
  const { next, answers } = useFlow();

  // Personalize the intro line with the user's first name. Falls back to
  // a name-less variant if we don't have one (defensive — the flow asks
  // for first name well upstream on funnels that use it, but not every
  // funnel collects one).
  const firstName = answers.firstName?.split(" ")[0]?.trim() ?? "";
  const intro =
    firstName.length > 0 ? `One last thing, ${firstName}…` : "One last thing…";

  const chunks: string[] = [
    intro,
    "I felt like something was *actually* changing when I noticed my scalp getting looser. It took about a week.",
    "I want you to feel what I did.",
  ];

  const [activeIndex, setActiveIndex] = useState(0);
  const [phase, setPhase] = useState<BeatPhase>("in");
  // Guard so tap-to-skip and the auto-hold timer can't both fire the same
  // beat transition (equivalent to Completer.isCompleted check in Flutter).
  const holdSkippedRef = useRef(false);
  // Guard so we only call next() once when the final beat completes.
  const advancedRef = useRef(false);

  useEffect(() => {
    if (activeIndex >= chunks.length) return;

    // Fade-in → hold → fade-out → next beat. Timings mirror the mobile
    // controller.forward() → _waitInterruptible(hold) → controller.reverse().
    let holdTimer: ReturnType<typeof setTimeout> | undefined;
    let outTimer: ReturnType<typeof setTimeout> | undefined;
    let advanceTimer: ReturnType<typeof setTimeout> | undefined;

    holdSkippedRef.current = false;
    setPhase("in");

    const inTimer = setTimeout(() => {
      setPhase("hold");
      holdTimer = setTimeout(() => {
        setPhase("out");
        outTimer = setTimeout(() => {
          const isLast = activeIndex === chunks.length - 1;
          if (isLast) {
            if (!advancedRef.current) {
              advancedRef.current = true;
              next();
            }
          } else {
            setActiveIndex((i) => i + 1);
          }
        }, FADE_MS);
      }, BEAT_HOLDS_MS[activeIndex]);
    }, FADE_MS);

    return () => {
      clearTimeout(inTimer);
      if (holdTimer) clearTimeout(holdTimer);
      if (outTimer) clearTimeout(outTimer);
      if (advanceTimer) clearTimeout(advanceTimer);
    };
    // chunks.length is a constant per render — safe dep list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  // Tap advances to the next beat instead of skipping the whole sequence.
  // Cuts short the current beat's hold by kicking straight to fade-out.
  const handleTap = () => {
    if (phase !== "hold" || holdSkippedRef.current) return;
    holdSkippedRef.current = true;
    setPhase("out");
    setTimeout(() => {
      const isLast = activeIndex === chunks.length - 1;
      if (isLast) {
        if (!advancedRef.current) {
          advancedRef.current = true;
          next();
        }
      } else {
        setActiveIndex((i) => i + 1);
      }
    }, FADE_MS);
  };

  const currentText = chunks[Math.min(activeIndex, chunks.length - 1)];

  return (
    <div
      onClick={handleTap}
      role="button"
      tabIndex={0}
      style={{
        position: "fixed",
        inset: 0,
        background: colors.black,
        color: colors.white,
        fontFamily: `${font.family}, -apple-system, sans-serif`,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0 32px",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          margin: "0 auto",
        }}
      >
        <p
          style={{
            fontSize: 28,
            fontWeight: font.weights.semibold,
            color: colors.white,
            letterSpacing: `${letterSpacing.titleTight}px`,
            lineHeight: lineHeight.base,
            margin: 0,
            textAlign: "left",
            opacity: phase === "hold" ? 1 : 0,
            transform:
              phase === "hold" ? "translateY(0)" : "translateY(16px)",
            transition: `opacity ${FADE_MS}ms cubic-bezier(0.215, 0.61, 0.355, 1), transform ${FADE_MS}ms cubic-bezier(0.215, 0.61, 0.355, 1)`,
          }}
        >
          {renderWithEmphasis(currentText)}
        </p>
      </div>
    </div>
  );
}

/**
 * Renders a chunk with *asterisk-wrapped* words italicized. Splits on
 * the `*` marker and italicizes every other segment (odd-indexed
 * segments = the ones between markers). Mirrors mobile _buildRichText.
 */
function renderWithEmphasis(text: string): React.ReactNode {
  const parts = text.split("*");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <em key={i} style={{ fontStyle: "italic" }}>
        {part}
      </em>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}
