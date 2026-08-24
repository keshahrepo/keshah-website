"use client";

// Web port of PostAuthFlow2 outcome_preview.dart.
//
// Sits between plan reveal and the trial paywall. Answers "and what does
// that actually look like?" with the app's Day 1 dashboard screenshot,
// while making the 60-day promise dated and specific ("Stop hair loss by
// [target date] · Then we'll help you maintain or regrow."). Header
// isolates the outcome so each page in the reveal → outcome → offer chain
// has one clear job.
//
// No back arrow — per the mobile spec the flow-level back affordance is
// the only global back during onboarding. No Firestore writes either;
// this is a pure preview screen.

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import startStyles from "../start.module.css";
import frame from "./app-preview.module.css";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Mobile ships a date 60 days from today ("Month D"). Rendered client-side
// so the copy stays in the user's local wall time — matches the mobile
// implementation which uses DateTime.now() without a timezone shift.
function targetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 60);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export default function OutcomePreview() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  const headline = isWomen
    ? `Your hair thinning should stop by ${targetDate()}.`
    : `Your hair loss should stop by ${targetDate()}.`;

  // Women's funnel doesn't have a dedicated dashboard screenshot on the
  // web yet — fall back to the shared dashboard preview so the page still
  // renders. Mirrors mobile which ships gender-specific PNGs at
  // assets/png/dashboard_preview{,_women}.png.
  const screenshot = isWomen
    ? "/start/app/dashboard_preview_women.jpeg"
    : "/start/app/dashboard_preview.jpeg";

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={startStyles.stepBody}>
      <div
        className={startStyles.stepInner}
        style={{
          alignItems: "center",
          textAlign: "center",
          paddingTop: "calc(env(safe-area-inset-top) + 56px)",
        }}
      >
        {/* Header — left-aligned in the mobile spec ("CrossAxisAlignment.start"),
            but the shared stepInner already centers the phone below. Keeping the
            header block left-anchored inside a max-width container preserves the
            mobile hierarchy while sitting cleanly above the centered device. */}
        <div style={{ width: "100%", maxWidth: 420, textAlign: "left" }}>
          <h1
            className={startStyles.headline}
            style={{ fontSize: 26, letterSpacing: -1.2, lineHeight: 1.3, margin: 0 }}
          >
            {headline}
          </h1>
          <p
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 15,
              fontWeight: 500,
              lineHeight: 1.4,
              color: "var(--text)",
              margin: "12px 0 0",
            }}
          >
            Then we&apos;ll help you maintain or regrow.
          </p>
        </div>

        <div className={frame.phone} style={{ marginTop: 32 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={screenshot}
            alt="KESHAH app — day 1 dashboard preview"
            className={frame.screenshot}
          />
        </div>
      </div>
      <div className={startStyles.buttonRow}>
        <button type="button" className={startStyles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
