"use client";

/**
 * QuizMoment — port of `QuizMoment` in
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/_quiz_widgets.dart:20
 *
 * Cinematic, full-screen dark auto-advancing beat. Text fades in with a
 * 20px upward slide over 800ms, holds ~1s, then fades out and calls
 * onComplete. Tap anywhere to skip forward.
 *
 * Timing matches mobile:
 *   100ms → start fade-in
 *   1800ms → begin fade-out (auto-advance)
 *   800ms fade duration
 */

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { colors } from "../../lib/tokens";

export interface QuizMomentProps {
  text: string;
  onComplete: () => void;
}

export function QuizMoment({ text, onComplete }: QuizMomentProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const inTimer = window.setTimeout(() => setVisible(true), 100);
    const outTimer = window.setTimeout(() => setVisible(false), 1800);
    return () => {
      window.clearTimeout(inTimer);
      window.clearTimeout(outTimer);
    };
  }, []);

  const skip = () => {
    if (!visible) return;
    setVisible(false);
  };

  return (
    <div
      onClick={skip}
      style={{
        position: "absolute",
        inset: 0,
        background: colors.black,
        display: "flex",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "0 36px",
        cursor: "pointer",
      }}
    >
      <AnimatePresence onExitComplete={onComplete}>
        {visible && (
          <motion.p
            key="moment"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 26,
              fontWeight: 600,
              color: colors.white,
              letterSpacing: -1.0,
              lineHeight: 1.3,
              margin: 0,
              maxWidth: 560,
            }}
          >
            {text}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
