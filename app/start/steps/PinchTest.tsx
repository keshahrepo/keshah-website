"use client";

// Port of pinch_test_page.dart — matched to the mobile source of truth.
// Sequence: pinch TOP (where losing hair) first, then pinch SIDES for
// comparison — the aha lands on the physical top→sides swap, not a
// baseline-first framing. Full 4-option comparison scale; "aboutSame"
// takes a soft-reframe path (mechanism + Yes/No exit) instead of an
// immediate hard disqualification.
import { useEffect, useState } from "react";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { trackSubStep } from "../lib/funnel-track";
import { currentUser } from "../lib/firebase-client";
import DisqualificationScreen from "../components/DisqualificationScreen";
import styles from "./pinch-test.module.css";

type PinchStep = "pinchTop" | "pinchSides" | "result" | "aboutSameReframe";
type Comparison = "muchTighter" | "tighter" | "aBitTighter" | "aboutSame";

// Four-option comparison scale — mirrors mobile verbatim. "muchTighter"
// and "tighter" both surface the same mechanism copy downstream, but the
// magnitude answer is persisted to Users.pinch_test_answer so the plan
// reveal / diagnosis screens can personalize accordingly.
const STANDARD_OPTIONS: { id: Comparison; label: string }[] = [
  { id: "muchTighter", label: "Much tighter where I'm losing hair" },
  { id: "tighter", label: "Tighter where I'm losing hair" },
  { id: "aBitTighter", label: "A bit tighter where I'm losing hair" },
];

// Mechanism copy for the tighter answers — cites two studies (numbered
// superscripts render as the RESEARCH card below the paragraph).
const RESULT_TIGHTER =
  "There it is. Where it's tight, you're losing hair. Where it's loose you're not.\n\nScalp tension is shown to reduce blood flow to the hair follicles¹, resulting in nutrient deficiency and hair loss.²";

// "About the same" bridge copy — supportive, keeps the user engaged
// before the soft-reframe screen offers them an out.
const RESULT_ABOUT_SAME =
  "Hard to feel at first, and that's normal. You'll notice it change once you start.\n\nRemember how it feels. In 7 days, you'll pinch it again and compare.";

const RESEARCH_TIGHTER =
  "¹ Scalp tension compresses subcutaneous vessels and reduces hair follicle perfusion.\nEnglish, 2018\n\n² Blood flow to balding scalp measured 2.6× lower than non-bald areas.\nKlemp & Peters, 1989";

const REFRAME_BODY =
  "A tight scalp may not be your primary issue — but the routine still increases blood circulation to your hair follicles, which supports growth for anyone.¹";

const RESEARCH_REFRAME =
  "¹ Standardized scalp stimulation has been shown to increase hair thickness and up-regulate hair growth genes.\nKoyama et al., 2016";

function resultText(c: Comparison, override?: string): string {
  switch (c) {
    case "muchTighter":
    case "tighter":
    case "aBitTighter":
      if (override) return override;
      return RESULT_TIGHTER;
    case "aboutSame":
      return RESULT_ABOUT_SAME;
  }
}

export default function PinchTest() {
  const { next } = useFlow();
  const config = useFunnelConfig();
  // Creator photos override the default Aadi pinch photos on /f/{slug}.
  const sidesImage = config.pinchSidesImage ?? "/start/pinch_sides_photo.jpg";
  const topImage = config.pinchTopImage ?? "/start/pinch_top_photo.jpg";
  // Women's funnels get a softer opener; default (men / auto) keeps the
  // conversational "Try something for me." Aadi voice.
  const isWomen = config.audience === "women";

  const [step, setStep] = useState<PinchStep>("pinchTop");
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [pinched, setPinched] = useState(false);
  const [showDisqualified, setShowDisqualified] = useState(false);

  // Track each sub-step for funnel analytics
  useEffect(() => {
    trackSubStep("pinchTest", step);
  }, [step]);

  // Funnel analytics — write pinch_test_started_at on mount so the
  // onboarding dashboard can count how many users reached the pinch test.
  // Skipped when the user isn't signed in yet (most non-India funnels).
  useEffect(() => {
    const user = currentUser();
    if (!user) return;
    try {
      const db = getFirestore();
      setDoc(
        doc(db, "Users", user.uid),
        { pinch_test_started_at: serverTimestamp() },
        { merge: true }
      ).catch(() => {});
    } catch {
      // Firestore may not be initialized in some environments; ignore.
    }
  }, []);

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

  // Disqualification screen — only reachable via the reframe "No, I'll pass".
  if (showDisqualified) {
    return (
      <DisqualificationScreen
        message="KESHAH might not be the right fit for you right now."
        subtext="KESHAH is designed for hair loss driven by scalp tension. Come back if things change."
        onGoBack={() => {
          setShowDisqualified(false);
          setStep("aboutSameReframe");
        }}
      />
    );
  }

  // Continue-button gating:
  // - pinchTop: user must tap the "I pinched" checkbox (mobile parity).
  // - pinchSides: user must select a comparison.
  // - result: always enabled.
  // - aboutSameReframe: has its own Yes/No buttons, hides the footer.
  const isEnabled =
    (step === "pinchTop" && pinched) ||
    (step === "pinchSides" && comparison !== null) ||
    step === "result";

  const persistAnswer = (value: Comparison) => {
    const user = currentUser();
    if (!user) return;
    try {
      const db = getFirestore();
      setDoc(
        doc(db, "Users", user.uid),
        { pinch_test_answer: value },
        { merge: true }
      ).catch(() => {});
    } catch {
      // ignore
    }
  };

  const handleContinue = () => {
    if (!isEnabled) return;
    mediumHaptic();
    if (step === "pinchTop") {
      setStep("pinchSides");
      return;
    }
    if (step === "pinchSides") {
      if (comparison) persistAnswer(comparison);
      setStep("result");
      return;
    }
    if (step === "result") {
      if (comparison === "aboutSame") {
        setStep("aboutSameReframe");
      } else {
        next();
      }
      return;
    }
  };

  return (
    <div className={styles.root}>
      <div
        className={styles.body}
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)" }}
      >
        {step === "pinchTop" && (
          <PinchTopStep
            image={topImage}
            isWomen={isWomen}
            pinched={pinched}
            onTogglePinched={() => {
              lightHaptic();
              setPinched((p) => !p);
            }}
          />
        )}
        {step === "pinchSides" && (
          <PinchSidesStep
            image={sidesImage}
            comparison={comparison}
            setComparison={(c) => {
              lightHaptic();
              setComparison(c);
            }}
          />
        )}
        {step === "result" && comparison && (
          <ResultStep
            text={resultText(comparison, config.pinchResultText)}
            research={comparison === "aboutSame" ? null : RESEARCH_TIGHTER}
          />
        )}
        {step === "aboutSameReframe" && (
          <ReframeStep
            body={REFRAME_BODY}
            research={RESEARCH_REFRAME}
            onYes={() => {
              mediumHaptic();
              next();
            }}
            onNo={() => {
              mediumHaptic();
              setShowDisqualified(true);
            }}
          />
        )}
      </div>
      {step !== "aboutSameReframe" && (
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
      )}
    </div>
  );
}

// First sub-step — user pinches the top of the head (where they're losing
// hair). Gender-conditional headline matches mobile: softer opener for
// women, conversational Aadi voice for men. Continue is gated on the
// "I pinched" checkbox so we know they actually did the physical action.
function PinchTopStep({
  image,
  isWomen,
  pinched,
  onTogglePinched,
}: {
  image: string;
  isWomen: boolean;
  pinched: boolean;
  onTogglePinched: () => void;
}) {
  return (
    <div className={`${styles.stepContent} ${styles.fadeSlide}`}>
      <h1 className={styles.headline}>
        {isWomen ? "Try this." : "Try something for me."}
      </h1>

      <p className={styles.description}>
        Take two fingers and a thumb and try to pinch and lift the skin where
        you&apos;re losing hair.
      </p>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt="Pinching the top of the head"
        className={styles.illustration}
      />

      <p className={styles.caption}>Notice the tightness.</p>

      <button
        type="button"
        className={styles.checkRow}
        onClick={onTogglePinched}
        aria-pressed={pinched}
      >
        <span
          className={`${styles.checkbox} ${pinched ? styles.checkboxChecked : ""}`}
        >
          {pinched && (
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
              <path
                d="M4 10L8 14L16 6"
                stroke="var(--bg)"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </span>
        <span className={styles.checkLabel}>I pinched</span>
      </button>
    </div>
  );
}

// Second sub-step — user pinches the sides for comparison and answers
// how they compare. Options describe the TOP's mobility relative to the
// sides they just felt.
function PinchSidesStep({
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
        Now pinch where you&apos;re NOT losing hair &mdash; like the sides.
      </h1>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt="Pinching the side of the head"
        className={styles.illustrationSmall}
      />

      <p className={styles.captionLarger}>Notice anything?</p>

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

        {/* "It's the same" — outline warning option. Routes through a
            soft reframe screen (mechanism copy + Yes/No exit) instead of
            a hard immediate disqualification. */}
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
            It&apos;s the same
          </span>
          <span className={styles.optionWarningSub}>
            This may not be the right approach for you
          </span>
        </button>
      </div>
    </div>
  );
}

function ResultStep({ text, research }: { text: string; research: string | null }) {
  return (
    <div className={`${styles.resultContent} ${styles.fadeSlide}`}>
      <p className={styles.resultText}>{text}</p>
      {research && <ResearchCard body={research} />}
    </div>
  );
}

// Soft-reframe screen shown after "It's the same". Presents the mechanism
// (routine helps blood flow for anyone) + a Koyama citation, then lets
// the user choose to continue or opt out.
function ReframeStep({
  body,
  research,
  onYes,
  onNo,
}: {
  body: string;
  research: string;
  onYes: () => void;
  onNo: () => void;
}) {
  return (
    <div
      className={`${styles.resultContent} ${styles.fadeSlide}`}
      style={{ paddingBottom: "24px" }}
    >
      <p className={styles.resultText}>{body}</p>
      <ResearchCard body={research} />
      <div style={{ marginTop: 32, display: "flex", flexDirection: "column", gap: 12 }}>
        <button type="button" className={styles.button} onClick={onYes}>
          Yes, continue
        </button>
        <button
          type="button"
          onClick={onNo}
          style={{
            display: "block",
            width: "100%",
            padding: "18px 0",
            background: "transparent",
            color: "var(--fg-70)",
            border: "none",
            borderRadius: 40,
            fontFamily: "inherit",
            fontSize: 15,
            fontWeight: 500,
            cursor: "pointer",
            textDecoration: "underline",
            textUnderlineOffset: 3,
          }}
        >
          No, I&apos;ll pass
        </button>
      </div>
    </div>
  );
}

function ResearchCard({ body }: { body: string }) {
  return (
    <div
      style={{
        marginTop: 28,
        padding: "16px 18px",
        borderRadius: 14,
        border: "1px solid var(--fg-15)",
        background: "transparent",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: 1.2,
          color: "var(--fg-50)",
          marginBottom: 8,
        }}
      >
        RESEARCH
      </div>
      <p
        style={{
          fontSize: 12,
          lineHeight: 1.5,
          color: "var(--fg-70)",
          whiteSpace: "pre-line",
          margin: 0,
        }}
      >
        {body}
      </p>
    </div>
  );
}
