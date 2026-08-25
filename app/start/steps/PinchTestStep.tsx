"use client";

/**
 * PinchTestStep — React port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/founder_story/pinch_test_page.dart
 *
 * Interactive multi-step scalp-tension diagnostic:
 *   1. pinchTop           — "Try something for me / Try this." Illustration
 *                            + "I pinched" checkbox gate.
 *   2. pinchSides         — Compare-side illustration + 4-way single pick.
 *   3. result             — TypingReveal + RESEARCH card (tighter branches),
 *                            gated Continue until reveal completes.
 *   3'. aboutSameReframe  — When the user picks "It's the same":
 *                            TypingReveal reframe body + Koyama card +
 *                            Yes/No, I'll pass row. "No" opens the
 *                            DisqualificationScreen overlay.
 *
 * Firestore field parity (integrator persists via /api/funnel/save-profile):
 *   pinch_test_answer        — muchTighter | tighter | aBitTighter | aboutSame
 *   pinch_test_started_at    — server timestamp funnel marker (see note)
 *
 * Fidelity notes:
 *   - `pinch_test_started_at` is written by the mobile at page mount
 *     against the signed-in user's Firestore doc. The web /start funnel
 *     has no Firebase UID until the SignUp step, so this per-mount
 *     marker isn't emitted here — the integrator layer can wire a
 *     /api/funnel/mark endpoint later if needed.
 *   - Women-specific illustrations don't ship in /public yet; we fall
 *     back to the men illustration for both genders so the layout
 *     doesn't 404. Swap once women assets are copied to /public/start.
 */

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { lightHaptic, selectionHaptic } from "../lib/haptics";
import { colors, radius } from "../lib/tokens";
import {
  DisqualificationScreen,
  KeshahButton,
  TypingReveal,
} from "../components/primitives";

type PinchStep = "pinchTop" | "pinchSides" | "result" | "aboutSameReframe";
type ComparisonResult = "muchTighter" | "tighter" | "aBitTighter" | "aboutSame";

const PER_WORD_MS = 80;
const INITIAL_DELAY_MS = 200;
const FADE_TAIL_MS = 280;

// Bodies + footers keyed by the comparison enum name so the fade timing
// and copy stay in one place.
const RESULT_BODY_TIGHTER =
  "There it is. Where it's tight, you're losing hair. Where it's loose you're not.\n\nScalp tension is shown to reduce blood flow to the hair follicles¹, resulting in nutrient deficiency and hair loss.²";

const RESULT_BODY_ABOUT_SAME =
  "Hard to feel at first, and that's normal. You'll notice it change once you start.\n\nRemember how it feels. In 7 days, you'll pinch it again and compare.";

const RESULT_FOOTER_TIGHTER =
  "¹ Scalp tension compresses subcutaneous vessels and reduces hair follicle perfusion.\nEnglish, 2018\n\n² Blood flow to balding scalp measured 2.6× lower than non-bald areas.\nKlemp & Peters, 1989";

const REFRAME_BODY =
  "A tight scalp may not be your primary issue — but the routine still increases blood circulation to your hair follicles, which supports growth for anyone.¹";

const REFRAME_FOOTER =
  "¹ Standardized scalp stimulation has been shown to increase hair thickness and up-regulate hair growth genes.\nKoyama et al., 2016";

function revealTotalMs(body: string): number {
  const words = body.split(/\s+/).filter(Boolean).length;
  return INITIAL_DELAY_MS + words * PER_WORD_MS + FADE_TAIL_MS;
}

export default function PinchTestStep() {
  const { answers, updateAnswers, next } = useFlow();
  const gender = answers.gender;

  const [step, setStep] = useState<PinchStep>("pinchTop");
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [didPinch, setDidPinch] = useState(false);
  // Gates the Continue button on the result / reframe step until the
  // typing reveal has finished — prevents a fast tap from step 2 landing
  // on step 3's Continue and skipping the reveal entirely.
  const [resultTapArmed, setResultTapArmed] = useState(false);
  const [showDisqualification, setShowDisqualification] = useState(false);

  // Arm the Continue button + fade the RESEARCH card in AFTER the typing
  // reveal completes on the result / reframe steps.
  useEffect(() => {
    if (step !== "result" && step !== "aboutSameReframe") return;
    const body =
      step === "aboutSameReframe"
        ? REFRAME_BODY
        : comparison === "aboutSame"
        ? RESULT_BODY_ABOUT_SAME
        : RESULT_BODY_TIGHTER;
    const t = setTimeout(() => setResultTapArmed(true), revealTotalMs(body));
    return () => clearTimeout(t);
  }, [step, comparison]);

  // Reset per-step scaffolding on step change so a revisit runs the same
  // fade-in / tap-arm sequence as first visit.
  const goToStep = useCallback((target: PinchStep) => {
    lightHaptic();
    setStep(target);
    setDidPinch(false);
    setResultTapArmed(false);
  }, []);

  const handleContinue = useCallback(() => {
    lightHaptic();
    switch (step) {
      case "pinchTop":
        goToStep("pinchSides");
        return;
      case "pinchSides": {
        if (!comparison) return;
        // Persist the pinch comparison answer once the user leaves the
        // compare step — mirrors the mobile updateUserModel write to
        // `pinch_test_answer`. Web persists via /api/funnel/save-profile
        // at SignUp; here we only stash in flow-state.
        updateAnswers({
          pinchTestAnswer: comparison,
        } as Partial<typeof answers> as never);
        // Route "It's the same" users directly to the reframe step — skip
        // the intermediate result page. Matches mobile branching.
        if (comparison === "aboutSame") {
          goToStep("aboutSameReframe");
        } else {
          goToStep("result");
        }
        return;
      }
      case "result":
      case "aboutSameReframe":
        next();
        return;
    }
  }, [answers, comparison, goToStep, next, step, updateAnswers]);

  const isContinueEnabled = useMemo(() => {
    switch (step) {
      case "pinchTop":
        return didPinch;
      case "pinchSides":
        return comparison !== null;
      case "result":
        return resultTapArmed;
      case "aboutSameReframe":
        return true;
    }
  }, [step, didPinch, comparison, resultTapArmed]);

  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        background: colors.black,
        display: "flex",
        flexDirection: "column",
        color: colors.white,
      }}
    >
      <div style={{ height: 12 }} />
      <div
        style={{
          flex: 1,
          padding: "0 28px",
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
        }}
      >
        {step === "pinchTop" && (
          <PinchInstruction
            gender={gender}
            didPinch={didPinch}
            onToggle={() => {
              lightHaptic();
              setDidPinch((p) => !p);
            }}
          />
        )}
        {step === "pinchSides" && (
          <Compare
            gender={gender}
            selected={comparison}
            onSelect={(v) => {
              lightHaptic();
              setComparison(v);
            }}
          />
        )}
        {step === "result" && comparison !== null && (
          <ResultBody comparison={comparison} armed={resultTapArmed} />
        )}
        {step === "aboutSameReframe" && (
          <ReframeBody armed={resultTapArmed} />
        )}
      </div>

      {step === "aboutSameReframe" ? (
        <ReframeButtonRow
          armed={resultTapArmed}
          onContinue={() => {
            lightHaptic();
            next();
          }}
          onPass={() => {
            selectionHaptic();
            setShowDisqualification(true);
          }}
        />
      ) : (
        <ContinueRow enabled={isContinueEnabled} onTap={handleContinue} />
      )}

      {showDisqualification && (
        <DisqualificationScreen
          message="KESHAH might not be the right fit for you right now."
          subtext="KESHAH is designed for hair loss driven by scalp tension. Come back if things change."
          onGoBack={() => setShowDisqualification(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Pinch top
// ─────────────────────────────────────────────────────────────────────────────

function PinchInstruction({
  gender,
  didPinch,
  onToggle,
}: {
  gender: string | undefined;
  didPinch: boolean;
  onToggle: () => void;
}) {
  // "Try something for me" is Aadi's voice — established for men via
  // FounderStory but women skip that step and have no narrator framed
  // yet, so the personal "for me" lands as a stranger speaking.
  // Neutralize for women.
  const title = gender === "female" ? "Try this." : "Try something for me.";

  // Image parity: mobile picks the women asset on female gender; web
  // falls back to the men asset until women artwork ships in /public.
  const imgSrc = "/start/pinch_test_illustration.png";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0, 0, 0.2, 1], delay: 0.2 }}
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
      }}
    >
      <div style={{ flex: 2 }} />
      <h1
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 24,
          fontWeight: 600,
          color: colors.white,
          letterSpacing: -0.5,
          margin: 0,
        }}
      >
        {title}
      </h1>
      <div style={{ height: 16 }} />
      <p
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 16,
          fontWeight: 400,
          color: "rgba(255,255,255,0.7)",
          lineHeight: 1.5,
          margin: 0,
        }}
      >
        Take two fingers and a thumb and try to pinch and lift the skin where
        you&apos;re losing hair.
      </p>
      <div style={{ height: 32 }} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "100%",
            height: 240,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <img
            src={imgSrc}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </div>
      <div style={{ height: 24 }} />
      <p
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 16,
          fontWeight: 500,
          color: "rgba(255,255,255,0.7)",
          margin: 0,
        }}
      >
        Notice the tightness.
      </p>
      <div style={{ height: 32 }} />
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.35 }}
      >
        <button
          type="button"
          onClick={onToggle}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "transparent",
            border: "none",
            padding: 0,
            cursor: "pointer",
          }}
        >
          <motion.span
            animate={{
              backgroundColor: didPinch ? colors.white : "rgba(0,0,0,0)",
              borderColor: didPinch ? colors.white : "rgba(255,255,255,0.3)",
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            style={{
              width: 22,
              height: 22,
              borderRadius: 6,
              borderStyle: "solid",
              borderWidth: 1.5,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {didPinch && (
              <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 12l5 5L20 7"
                  stroke={colors.black}
                  strokeWidth="3"
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </motion.span>
          <span
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 15,
              fontWeight: 400,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            I pinched
          </span>
        </button>
      </motion.div>
      <div style={{ flex: 3 }} />
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Compare
// ─────────────────────────────────────────────────────────────────────────────

const COMPARE_OPTIONS: { label: string; value: ComparisonResult }[] = [
  { label: "Much tighter where I'm losing hair", value: "muchTighter" },
  { label: "Tighter where I'm losing hair", value: "tighter" },
  { label: "A bit tighter where I'm losing hair", value: "aBitTighter" },
  { label: "It's the same", value: "aboutSame" },
];

function Compare({
  gender,
  selected,
  onSelect,
}: {
  gender: string | undefined;
  selected: ComparisonResult | null;
  onSelect: (v: ComparisonResult) => void;
}) {
  void gender; // asset parity is best-effort until women assets ship
  const imgSrc = "/start/pinch_test_side_illustration.png";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
      style={{ display: "flex", flexDirection: "column" }}
    >
      <div style={{ height: 24 }} />
      <h1
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 22,
          fontWeight: 600,
          color: colors.white,
          lineHeight: 1.5,
          letterSpacing: -0.5,
          margin: 0,
        }}
      >
        Now pinch where you&apos;re NOT losing hair — like the sides.
      </h1>
      <div style={{ height: 24 }} />
      <div style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            width: "100%",
            height: 200,
            borderRadius: 20,
            overflow: "hidden",
          }}
        >
          <img
            src={imgSrc}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      </div>
      <div style={{ height: 24 }} />
      <h2
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 20,
          fontWeight: 600,
          color: colors.white,
          letterSpacing: -0.5,
          margin: 0,
        }}
      >
        Notice anything?
      </h2>
      <div style={{ height: 20 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {COMPARE_OPTIONS.map((opt) => (
          <CompareOption
            key={opt.value}
            label={opt.label}
            value={opt.value}
            selected={selected === opt.value}
            onTap={() => onSelect(opt.value)}
          />
        ))}
      </div>
      <div style={{ height: 24 }} />
    </motion.div>
  );
}

function CompareOption({
  label,
  value,
  selected,
  onTap,
}: {
  label: string;
  value: ComparisonResult;
  selected: boolean;
  onTap: () => void;
}) {
  void value;
  return (
    <button
      type="button"
      onClick={onTap}
      style={{
        width: "100%",
        padding: "16px 20px",
        background: "transparent",
        borderRadius: 14,
        borderStyle: "solid",
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? colors.white : "rgba(255,255,255,0.15)",
        display: "flex",
        alignItems: "center",
        cursor: "pointer",
        textAlign: "left",
        transition: "border-color 150ms ease, border-width 150ms ease",
      }}
    >
      <span
        style={{
          flex: 1,
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 15,
          fontWeight: 500,
          color: selected ? colors.white : "rgba(255,255,255,0.5)",
        }}
      >
        {label}
      </span>
      {selected && (
        <span style={{ marginLeft: 12, display: "inline-flex" }}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 12l5 5L20 7"
              stroke={colors.white}
              strokeWidth="2.5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Result
// ─────────────────────────────────────────────────────────────────────────────

function ResultBody({
  comparison,
  armed,
}: {
  comparison: ComparisonResult;
  armed: boolean;
}) {
  const isTighter = comparison !== "aboutSame";
  const body = isTighter ? RESULT_BODY_TIGHTER : RESULT_BODY_ABOUT_SAME;
  const footer = isTighter ? RESULT_FOOTER_TIGHTER : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1 }} />
      <TypingReveal
        text={body}
        initialDelayMs={INITIAL_DELAY_MS}
        perWordMs={PER_WORD_MS}
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 22,
          fontWeight: 500,
          color: "rgba(255,255,255,0.9)",
          letterSpacing: -0.4,
          lineHeight: 1.4,
        }}
      />
      <div style={{ flex: 2 }} />
      {footer && <ResearchCard armed={armed} body={footer} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3' — About-same reframe
// ─────────────────────────────────────────────────────────────────────────────

function ReframeBody({ armed }: { armed: boolean }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
      <div style={{ flex: 1 }} />
      <TypingReveal
        text={REFRAME_BODY}
        initialDelayMs={INITIAL_DELAY_MS}
        perWordMs={PER_WORD_MS}
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 22,
          fontWeight: 500,
          color: "rgba(255,255,255,0.9)",
          letterSpacing: -0.4,
          lineHeight: 1.4,
        }}
      />
      <div style={{ flex: 2 }} />
      <ResearchCard armed={armed} body={REFRAME_FOOTER} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared — RESEARCH card (fades in after typing reveal completes)
// ─────────────────────────────────────────────────────────────────────────────

function ResearchCard({ armed, body }: { armed: boolean; body: string }) {
  return (
    <motion.div
      animate={{ opacity: armed ? 1 : 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ padding: "20px 0 24px" }}
    >
      <div
        style={{
          width: "100%",
          padding: 14,
          borderRadius: 12,
          background: "rgba(255,255,255,0.05)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 10,
            fontWeight: 600,
            color: "rgba(255,255,255,0.4)",
            letterSpacing: 1.5,
          }}
        >
          RESEARCH
        </div>
        <div style={{ height: 6 }} />
        <div
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 12,
            fontWeight: 400,
            color: "rgba(255,255,255,0.6)",
            lineHeight: 1.45,
            letterSpacing: -0.1,
            whiteSpace: "pre-line",
          }}
        >
          {body}
        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────────────────────

function ContinueRow({
  enabled,
  onTap,
}: {
  enabled: boolean;
  onTap: () => void;
}) {
  return (
    <div style={{ padding: "0 25px 35px" }}>
      <motion.button
        type="button"
        onClick={enabled ? onTap : undefined}
        disabled={!enabled}
        whileTap={enabled ? { scale: 0.98 } : undefined}
        transition={{ duration: 0.2, ease: "easeOut" }}
        animate={{
          backgroundColor: enabled ? colors.white : "rgba(255,255,255,0.3)",
          color: enabled ? colors.black : "rgba(255,255,255,0.5)",
        }}
        style={{
          width: "100%",
          padding: "18px 0",
          borderRadius: radius.button,
          border: "none",
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 16,
          fontWeight: 600,
          cursor: enabled ? "pointer" : "not-allowed",
        }}
      >
        Continue
      </motion.button>
    </div>
  );
}

function ReframeButtonRow({
  armed,
  onContinue,
  onPass,
}: {
  armed: boolean;
  onContinue: () => void;
  onPass: () => void;
}) {
  return (
    <motion.div
      animate={{ opacity: armed ? 1 : 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      style={{ padding: "0 25px 35px", pointerEvents: armed ? "auto" : "none" }}
    >
      <KeshahButton
        expanded
        title="Yes, continue"
        onTap={armed ? onContinue : undefined}
        backgroundColor={armed ? colors.white : "rgba(255,255,255,0.3)"}
        color={armed ? colors.black : "rgba(255,255,255,0.5)"}
        fontSize={16}
        style={{ padding: "18px 15px", fontWeight: 600 }}
      />
      <div style={{ height: 8 }} />
      <button
        type="button"
        onClick={armed ? onPass : undefined}
        disabled={!armed}
        style={{
          width: "100%",
          padding: "14px 0",
          background: "transparent",
          border: "none",
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 14,
          fontWeight: 500,
          color: "rgba(255,255,255,0.5)",
          cursor: armed ? "pointer" : "not-allowed",
        }}
      >
        No, I&apos;ll pass
      </button>
    </motion.div>
  );
}
