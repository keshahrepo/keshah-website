"use client";

// Bridge step between SocialProof and TrialPaywall — the "here's what to
// expect" moment right before the buy decision. Used to be a phone mockup
// page (the techniques preview already shows the app). Now it absorbs the
// honest timeline + shed-more-first pre-handle that previously bloated the
// PersonalizedDiagnosis page.
//
// Position is intentional: timeline + shed warning land HERE, when the
// user has already bought into the diagnosis and is one tap from paywall.
// At that point they're asking "OK what does the next 6 months actually
// look like?" — so giving them the honest answer is the close, not the
// pitch.

import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import StepHeader from "../components/StepHeader";
import styles from "./treatment-ready.module.css";

const TIMELINE = [
  { week: "Week 2", body: "Your scalp starts to feel looser. That's the first sign it's working." },
  { week: "Weeks 4 to 8", body: "Less hair on your pillow. Less hair in the drain." },
  { week: "Months 4 to 6", body: "Your hair starts looking thicker again." },
  { week: "Week 24", body: "You see the full result." },
];

export default function TreatmentReady() {
  const { next, back } = useFlow();

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.root}>
      <StepHeader onBack={back} />
      <div className={styles.body}>
        <div className={styles.text}>
          <h1 className={styles.headline}>Your treatment is ready.</h1>
          <p className={styles.subtitle}>
            10 to 15 minutes a day, guided in the KESHAH app.
          </p>
        </div>

        {/* Honest timeline — what each phase actually looks like. */}
        <div
          style={{
            background: "var(--fg-4)",
            border: "1px solid var(--fg-10)",
            borderRadius: 16,
            padding: "20px 22px",
            marginTop: 12,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "var(--fg-50)",
              margin: 0,
              marginBottom: 14,
            }}
          >
            What to expect
          </p>
          {TIMELINE.map((row, i) => (
            <div
              key={row.week}
              style={{
                display: "flex",
                gap: 16,
                paddingBottom: 10,
                marginBottom: 10,
                borderBottom: i === TIMELINE.length - 1 ? "none" : "1px solid var(--fg-6)",
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, minWidth: 80, paddingTop: 1 }}>
                {row.week}
              </span>
              <span style={{ fontSize: 14, color: "var(--fg-65)", lineHeight: 1.45 }}>
                {row.body}
              </span>
            </div>
          ))}
          <p
            style={{
              fontSize: 12,
              color: "var(--fg-50)",
              margin: 0,
              marginTop: 4,
              lineHeight: 1.5,
            }}
          >
            Based on the 2016 standardized scalp massage study (Koyama et al, 24 weeks).
          </p>
        </div>

        {/* Honesty box — pre-handles the "shed more first" objection. The
            single most important paragraph for any minoxidil-burned prospect
            who associates "starting a routine" with "shedding more and
            quitting." */}
        <div
          style={{
            background: "var(--fg-4)",
            border: "1px solid var(--fg-10)",
            borderRadius: 16,
            padding: "18px 22px",
            marginTop: 12,
          }}
        >
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.5,
              textTransform: "uppercase",
              color: "var(--fg-50)",
              margin: 0,
              marginBottom: 10,
            }}
          >
            One thing most people won&apos;t tell you
          </p>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.55,
              color: "var(--fg-80)",
              margin: 0,
            }}
          >
            From week 6 to week 12 you might lose a bit more hair than usual. That&apos;s your old hair on the way out so new hair can grow in. By week 24 you&apos;re growing more than you&apos;re losing. We&apos;d rather tell you that now than have you panic and quit.
          </p>
        </div>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
