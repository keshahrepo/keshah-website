"use client";

// Direct port of pinch_test_page.dart with two adaptations:
// 1. 4 options collapsed to 3 — Flutter's "muchTighter" and "tighter" produced
//    identical result text, so they're now one unified "Tighter" option.
// 2. "About the same" is rendered as an outline-with-subtext warning option
//    (matching the qualification screen pattern) and routes to a hard
//    DisqualificationScreen instead of the soft encouragement message.
import { useEffect, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { trackSubStep } from "../lib/funnel-track";
import DisqualificationScreen from "../components/DisqualificationScreen";
import styles from "./pinch-test.module.css";

type PinchStep = "pinchTop" | "pinchSides" | "result";
type Comparison = "tighter" | "aBitTighter" | "aboutSame";

// Labels map to magnitude of tightness, not just "yes/no it's tighter."
// Reframed because top-of-head being tighter than sides is universal
// anatomy — what actually differentiates a hair-loss user is HOW tight.
// "Way tighter, barely moves" = the strong signal. "Definitely tighter"
// = mild signal. "About the same" = goal state (and disqualifies, since
// scalp exercises won't help if their scalp already moves freely).
const STANDARD_OPTIONS: { id: Comparison; label: string }[] = [
  { id: "tighter", label: "Way tighter where I'm losing hair" },
  { id: "aBitTighter", label: "Definitely tighter where I'm losing hair" },
];

// Result text for the bridge moment between pinch test and the next page
// (founder story for men, mini-origin-story or mechanism for women).
// One unified text for both "tighter" and "a bit tighter" — both answers prove
// the same point (the user felt a difference), so differentiating them is fake
// personalization. Default is Aadi's first-person voice; women's funnels and
// creator funnels override via funnel config to keep voice coherent.
function resultText(c: Comparison, override?: string, isWomen?: boolean): string {
  switch (c) {
    case "tighter":
    case "aBitTighter":
      if (override) return override;
      if (isWomen) {
        // Universal women's bridge — observation, solution-forward mechanism,
        // diagnostic close. Single beat; the brand reveal happens at the
        // paywall via the creator's "I joined Keshah" trust quote, not here.
        // Solution-forward framing ("massages loosen + restore blood flow")
        // primes the user for the personalized scalp-massage plan that the
        // quiz produces next.
        return "That's exactly what most women feel.\n\nTight where the hair is thinning, flexible where it isn't.\n\nScalp massages can help loosen the scalp and restore blood flow.\n\nLet's see if they can help you.";
      }
      return "That's exactly what I felt 4 years ago.\n\nTight where I was losing hair, flexible where I wasn't.\n\nI found something not enough people are talking about. Here's my story.";
    case "aboutSame":
      // Unreachable — aboutSame leads to the disqualification screen, not the result step.
      return "";
  }
}

export default function PinchTest() {
  const { next } = useFlow();
  const config = useFunnelConfig();
  // Creator photos override the default Aadi pinch photos on /f/{slug}.
  const sidesImage = config.pinchSidesImage ?? "/start/pinch_sides_photo.jpg";
  const topImage = config.pinchTopImage ?? "/start/pinch_top_photo.jpg";
  // Order swapped — pinch sides FIRST so the user establishes a personal
  // baseline ("normal scalp"), then pinches top against that baseline.
  // Aha lands instantly when they hit the top instead of being a delayed
  // retrofit comparison. The step IDs ("pinchSides", "pinchTop") still
  // reflect WHAT each sub-step asks the user to pinch — only the flow
  // sequence changed.
  const [step, setStep] = useState<PinchStep>("pinchSides");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [showDisqualified, setShowDisqualified] = useState(false);

  // Track each sub-step for funnel analytics
  useEffect(() => {
    trackSubStep("pinchTest", step);
  }, [step]);

  // Prefetch the first few Founder Story assets on mount so the jump to
  // beat 1 feels instant on mobile data.
  useEffect(() => {
    const prefetch = [
      "/start/story/before_hairline.jpg",
      "/start/story/scalp_tension_study.jpg",
    ];
    for (const src of prefetch) {
      const img = new window.Image();
      img.src = src;
    }
  }, []);

  // Disqualification screen for "The same" answer.
  // Single self-contained sentence — no judgmental "most people feel..."
  // framing, no brand reference (KESHAH hasn't been introduced yet at this
  // point in the funnel), no need for a subtext.
  if (showDisqualified) {
    return (
      <DisqualificationScreen
        message="If your scalp is flexible even where you are losing hair, this may not be the right fit for you."
        onGoBack={() => {
          // Return to the comparison step so they can re-pick or try the test again.
          setShowDisqualified(false);
        }}
      />
    );
  }

  // Sides has no question (just an instruction), so Continue is always
  // enabled there. Top now carries the comparison options, so Continue
  // gates on a comparison being selected.
  const isEnabled =
    step === "pinchSides" ||
    (step === "pinchTop" && comparison !== null) ||
    step === "result";

  const handleContinue = () => {
    if (!isEnabled) return;
    mediumHaptic();
    if (step === "pinchSides") {
      setStep("pinchTop");
      return;
    }
    if (step === "pinchTop") {
      if (comparison === "aboutSame") {
        setShowDisqualified(true);
      } else {
        setStep("result");
      }
      return;
    }
    next();
  };

  return (
    <div className={styles.root}>
      <div
        className={styles.body}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}
      >
        {step === "pinchSides" && <PinchSidesStep image={sidesImage} />}
        {step === "pinchTop" && (
          <PinchTopStep
            image={topImage}
            comparison={comparison}
            setComparison={(c) => {
              lightHaptic();
              setComparison(c);
            }}
          />
        )}
        {step === "result" && comparison && comparison !== "aboutSame" && (
          <ResultStep text={resultText(comparison, config.pinchResultText, config.audience === "women")} />
        )}
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={`${styles.button} ${!isEnabled ? styles.buttonDisabled : ""}`}
          onClick={handleContinue}
          disabled={!isEnabled}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

// First sub-step (sides) — pure baseline. No question, just an instruction
// to pinch their sides and feel "normal scalp." Establishes the personal
// reference point they'll compare the top against on the next sub-step.
function PinchSidesStep({ image }: { image: string }) {
  return (
    <div className={`${styles.stepContent} ${styles.fadeSlide}`}>
      <h1 className={styles.headline}>
        Pinch the sides of your head, where your hair is still strong.
      </h1>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt="Pinching the side of the head"
        className={styles.illustration}
      />

      <p className={styles.caption}>Notice how easy it is to grab skin.</p>
    </div>
  );
}

// Second sub-step (top) — comparison happens here. The user just felt
// their sides; now they pinch the top and judge how it compares. Options
// describe the TOP's mobility (since that's the focus of the comparison).
function PinchTopStep({
  image,
  comparison,
  setComparison,
}: {
  image: string;
  comparison: Comparison | null;
  setComparison: (c: Comparison) => void;
}) {
  const aboutSameSelected = comparison === "aboutSame";

  return (
    <div className={`${styles.stepContent} ${styles.fadeSlide}`}>
      <h1 className={styles.headline}>
        Now try to pinch up skin where you&apos;re losing hair.
      </h1>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt="Pinching the top of the head"
        className={styles.illustrationSmall}
      />

      <p className={styles.captionLarger}>Notice the difference?</p>

      <div className={styles.options}>
        {STANDARD_OPTIONS.map((opt) => {
          const isSelected = comparison === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`${styles.option} ${isSelected ? styles.optionSelected : ""}`}
              onClick={() => setComparison(opt.id)}
            >
              <span className={isSelected ? styles.optionLabelActive : styles.optionLabel}>
                {opt.label}
              </span>
              {isSelected && (
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M4 10L8 14L16 6"
                    stroke="var(--text)"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          );
        })}

        {/* "About the same" — outline warning option, routes to the
            disqualification screen since scalp exercises won't help if
            their top scalp is already as flexible as their sides. */}
        <button
          type="button"
          className={`${styles.optionWarning} ${
            aboutSameSelected ? styles.optionWarningSelected : ""
          }`}
          onClick={() => setComparison("aboutSame")}
        >
          <span
            className={
              aboutSameSelected ? styles.optionWarningMainActive : styles.optionWarningMain
            }
          >
            Same as the sides
          </span>
          <span className={styles.optionWarningSub}>
            This may not be the right approach for you
          </span>
        </button>
      </div>
    </div>
  );
}

function ResultStep({ text }: { text: string }) {
  return (
    <div className={`${styles.resultContent} ${styles.fadeSlide}`}>
      <p className={styles.resultText}>{text}</p>
    </div>
  );
}
