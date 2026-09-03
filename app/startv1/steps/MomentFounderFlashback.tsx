"use client";

/**
 * MomentFounderFlashback — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/moment_founder_flashback.dart
 *
 * Cinematic 3-beat personal moment right before the trial paywall. Aadi
 * greets the reader by name, shares a week-one memory, then invites them
 * in. Each beat fades in (900ms) → holds (1200/3500/2800ms, tap-skippable)
 * → fades out (900ms). Tapping during a hold advances to the next beat;
 * tapping during the final hold ends the sequence and hands off to the
 * paywall. Words wrapped in *asterisks* render italic for word-level
 * emphasis.
 *
 * No Firestore writes. Linear (no branching). Shown to both genders.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { colors } from "../lib/tokens";
import { useFlow } from "../lib/flow-context";

const FADE_MS = 900;
const HOLDS_MS = [1200, 3500, 2800] as const;

/** Split on `*` and italicize every odd-indexed segment. Mirrors the
 * Flutter _buildRichText helper — the asterisks themselves are dropped
 * and the segments they wrap render in italic. */
function renderChunk(text: string) {
  const parts = text.split("*");
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <span key={i} style={{ fontStyle: "italic" }}>
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    )
  );
}

export default function MomentFounderFlashback() {
  const { next, answers } = useFlow();

  const chunks = useMemo(() => {
    const firstName = (answers.firstName ?? "").split(" ")[0]?.trim() ?? "";
    const intro =
      firstName.length > 0 ? `One last thing, ${firstName}…` : "One last thing…";
    return [
      intro,
      "I felt like something was *actually* changing when I noticed my scalp getting looser. It took about a week.",
      "I want you to feel what I did.",
    ];
  }, [answers.firstName]);

  // Sequence state machine: index = which beat we're on;
  // phase = fading-in ("in") → holding ("hold") → fading-out ("out").
  // We render the current chunk while it's `in` or `hold`; on `out` the
  // AnimatePresence exit fires the fade. When exit completes we bump to
  // the next beat (or call next() after the final beat).
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(false);
  const holdTimerRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const clearHold = () => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  // Kick off each beat: mount + fade in, then schedule the hold. When
  // the hold elapses (or is skipped by tap) we set visible=false and let
  // AnimatePresence run the fade-out.
  useEffect(() => {
    if (index >= chunks.length) return;
    // Short defer so the initial={opacity:0} paints before animate={opacity:1}.
    const inTimer = window.setTimeout(() => setVisible(true), 20);
    return () => {
      window.clearTimeout(inTimer);
      clearHold();
    };
  }, [index, chunks.length]);

  // When the fade-in animation completes we start the tap-skippable hold.
  const handleFadeInComplete = useCallback(() => {
    if (!visible) return;
    clearHold();
    const hold = HOLDS_MS[Math.min(index, HOLDS_MS.length - 1)];
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null;
      setVisible(false);
    }, hold);
  }, [index, visible]);

  // When the fade-out completes: advance to the next beat, or on the
  // final beat call onComplete so the paywall fades in from black.
  const handleExitComplete = useCallback(() => {
    if (doneRef.current) return;
    if (index >= chunks.length - 1) {
      doneRef.current = true;
      next();
      return;
    }
    setIndex((i) => i + 1);
  }, [index, chunks.length, next]);

  // Tap anywhere during the current hold to advance to the next beat.
  // Ignored while fade-in or fade-out is still running.
  const handleTap = useCallback(() => {
    if (holdTimerRef.current === null) return;
    clearHold();
    setVisible(false);
  }, []);

  return (
    <div
      onClick={handleTap}
      style={{
        position: "absolute",
        inset: 0,
        background: colors.black,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0 32px",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      <AnimatePresence mode="wait" onExitComplete={handleExitComplete}>
        {visible && index < chunks.length && (
          <motion.p
            key={index}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: FADE_MS / 1000, ease: "easeOut" }}
            onAnimationComplete={handleFadeInComplete}
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 28,
              fontWeight: 600,
              color: colors.white,
              letterSpacing: -1.0,
              lineHeight: 1.32,
              margin: 0,
              maxWidth: 560,
              textAlign: "left",
            }}
          >
            {renderChunk(chunks[index])}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
