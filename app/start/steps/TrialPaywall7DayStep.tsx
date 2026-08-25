"use client";

/**
 * TrialPaywall7DayStep — web port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/trial_paywall_7day.dart
 *
 * 7-day trial paywall. Structure ported 1:1:
 *   - Heading + subhead
 *   - 5-step timeline (Today / Day 1-6 / Day 7 / Day 60-90 / Day 90+) with a
 *     dashed "IF YOU CONTINUE AFTER DAY 7" divider between in-trial and
 *     post-trial rows.
 *   - Hairline divider, pricing block ("Plan starts at $33/month ...").
 *   - Optional "+ Free 20-min personalized session with Aadi" bonus card
 *     gated by AppSettingsModel.onboardingCallEnabled — defaults false (the
 *     mobile fallback when the app-settings doc hasn't loaded yet).
 *   - Sticky CTA "Try 7 days free" + "No payment today. Cancel in app anytime."
 *
 * Animation (SingleTickerProviderStateMixin, 1200ms) — three staggered
 * FadeTransitions ~100ms after mount, mirroring PlanReveal so this feels
 * like a continuation of the prior screen:
 *   - headerFade  0.0 → 0.3   (0ms   → 360ms)
 *   - bodyFade    0.2 → 0.55  (240ms → 660ms)
 *   - ctaFade     0.45 → 0.8  (540ms → 960ms)
 * Curves.easeOut → cubic-bezier(0, 0, 0.2, 1).
 *
 * Firestore parity: mobile writes `started_trial` (as a map: at, product_id,
 * source) after a successful RC purchase. On web the user is anonymous at
 * this point in the funnel — no user doc to write to. We stash the intent
 * into flow context under the same key so downstream SignUp can flush it to
 * Firestore alongside the other quiz answers. Field name preserved exactly.
 *
 * Purchase — mobile buys the RC `$rc_custom_stop_3mo` package under offering
 * `stoppage_treatment_v3`. The web funnel routes purchases through the
 * `signUp` step (auth-then-purchase). This step records the tier intent and
 * advances; the actual RC checkout happens after sign-in.
 */

import { motion } from "framer-motion";
import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { lightHaptic } from "../lib/haptics";
import { colors } from "../lib/tokens";

const EASE_OUT: [number, number, number, number] = [0, 0, 0.2, 1];
const KICKOFF_DELAY = 0.1;

// Controller duration = 1200ms; each fade's Interval maps to (begin*1200,
// end*1200) — translated to framer-motion (delay + duration) below.
const HEADER_ANIM = { duration: 0.36, delay: KICKOFF_DELAY, ease: EASE_OUT };
const BODY_ANIM = { duration: 0.42, delay: KICKOFF_DELAY + 0.24, ease: EASE_OUT };
const CTA_ANIM = { duration: 0.42, delay: KICKOFF_DELAY + 0.54, ease: EASE_OUT };

const GREEN = "#4CAF50";

// Mobile default fallback (`AppRepo.audioBookModel?.onboardingCallEnabled ??
// false`) — bonus card hidden unless the remote flag is on.
const SHOW_CALL_BONUS = false;

// Default fallback prices (mobile falls back to these when the RC store
// product hasn't resolved yet). Web funnel doesn't fetch RC on this step —
// the actual purchase happens in SignUp — so we render the fallback.
const PLAN_PRICE_DISPLAY = "$99";
const MONTHLY_EQUIV_DISPLAY = "$33";

interface TimelineStep {
  title: string;
  body: string;
  inTrial: boolean;
}

const STEPS: TimelineStep[] = [
  { title: "Today", body: "Full access unlocked. No payment.", inTrial: true },
  { title: "Day 1-6", body: "Scalp starts to loosen.", inTrial: true },
  { title: "Day 7", body: "Plan starts. Cancel easily before then.", inTrial: true },
  { title: "Day 60-90", body: "Hair fall stops.", inTrial: false },
  { title: "Day 90+", body: "Keep your results.", inTrial: false },
];

// 4px dash / 4px gap vertical line — matches Flutter _DashedLinePainter.
function DashedVerticalLine({ height }: { height: number | string }) {
  return (
    <div
      aria-hidden
      style={{
        width: 2,
        height,
        backgroundImage:
          "linear-gradient(to bottom, rgba(255,255,255,0.35) 50%, transparent 50%)",
        backgroundSize: "2px 8px",
        backgroundRepeat: "repeat-y",
      }}
    />
  );
}

export default function TrialPaywall7DayStep() {
  const { next, updateAnswers } = useFlow();

  // Funnel: mark first mount. Mobile also writes `paywall_viewed_at` here
  // (merge). On web there's no user doc yet — SignUp handles first-write.
  useEffect(() => {
    // No-op on web; kept as documentation of the mobile parity.
  }, []);

  const handleCta = () => {
    lightHaptic();
    // Preserve mobile field name exactly. `at` is set here as the intent
    // timestamp; SignUp will re-stamp on the actual purchase confirmation.
    (updateAnswers as (patch: Record<string, unknown>) => void)({
      started_trial: {
        at: new Date().toISOString(),
        product_id: null,
        source: "web_trial_paywall_7day",
      },
      purchaseTier: "threeMonthTrial",
    });
    next();
  };

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        width: "100%",
        minHeight: "100%",
        flex: 1,
        background: colors.black,
        color: colors.white,
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          padding: "40px 32px 20px",
        }}
      >
        <div style={{ maxWidth: 520, marginLeft: "auto", marginRight: "auto" }}>
          {/* Header */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={HEADER_ANIM}>
            <h1
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 26,
                fontWeight: 600,
                color: colors.white,
                letterSpacing: "-1.2px",
                lineHeight: 1.3,
                margin: 0,
              }}
            >
              Try KESHAH free for a week.
            </h1>
            <div style={{ height: 12 }} />
            <p
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 15,
                fontWeight: 500,
                color: colors.white,
                lineHeight: 1.4,
                margin: 0,
                textAlign: "left",
              }}
            >
              If your scalp feels looser in 7 days, keep going. If not, cancel and pay nothing.
            </p>
          </motion.div>

          <div style={{ height: 36 }} />

          {/* Timeline */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={BODY_ANIM}>
            <Timeline />
          </motion.div>

          {/* Hairline divider before pricing block */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={BODY_ANIM}>
            <div
              style={{
                height: 0.5,
                margin: "40px 0",
                background: "rgba(255,255,255,0.15)",
              }}
            />
          </motion.div>

          {/* Pricing block */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={BODY_ANIM}>
            <p
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 13,
                fontWeight: 400,
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.45,
                margin: "4px 0",
                textAlign: "left",
              }}
            >
              Plan starts at{" "}
              <span style={{ fontWeight: 600 }}>{MONTHLY_EQUIV_DISPLAY}/month</span>
              {` (3-month commitment. Billed as ${PLAN_PRICE_DISPLAY} every 3 months). Cancel anytime.`}
            </p>
          </motion.div>

          {SHOW_CALL_BONUS && (
            <>
              <div style={{ height: 20 }} />
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={BODY_ANIM}>
                <CallBonusCard />
              </motion.div>
            </>
          )}
        </div>
      </div>

      {/* Sticky CTA */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={CTA_ANIM}
        style={{
          padding: "12px 25px 16px",
          background: colors.black,
          borderTop: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <button
          type="button"
          onClick={handleCta}
          style={{
            width: "100%",
            padding: "18px 0",
            borderRadius: 40,
            border: "none",
            background: colors.white,
            color: colors.black,
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          Try 7 days free
        </button>
        <div style={{ height: 10 }} />
        <p
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 12,
            fontWeight: 500,
            color: "#fff",
            lineHeight: 1.5,
            textAlign: "center",
            margin: 0,
          }}
        >
          No payment today. Cancel in app anytime.
        </p>
        {/* Honest-urgency note — real ad decay, not a fake timer. */}
        <p
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 11,
            fontWeight: 400,
            color: "rgba(255,255,255,0.35)",
            lineHeight: 1.5,
            textAlign: "center",
            margin: "6px 0 0",
          }}
        >
          Note: This trial offer is shown to you based on Meta AI’s targeting.
          You may not see this offer again.
        </p>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Timeline
// ─────────────────────────────────────────────────────────────
function Timeline() {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {STEPS.map((step, i) => {
        const prev = i > 0 ? STEPS[i - 1] : null;
        const next = i < STEPS.length - 1 ? STEPS[i + 1] : null;
        const isFirstPostTrial = prev != null && prev.inTrial && !step.inTrial;
        const isLast = next == null;
        const connectorDashed = next != null && next.inTrial !== step.inTrial;
        return (
          <div key={step.title}>
            {isFirstPostTrial && <TimelineDivider />}
            <StepRow step={step} isLast={isLast} connectorDashed={connectorDashed} />
          </div>
        );
      })}
    </div>
  );
}

function TimelineDivider() {
  return (
    <div style={{ display: "flex", alignItems: "stretch", minHeight: 40, paddingBottom: 20 }}>
      <div
        style={{
          width: 28,
          display: "flex",
          justifyContent: "center",
          alignItems: "stretch",
        }}
      >
        <DashedVerticalLine height="100%" />
      </div>
      <div style={{ flex: 1, paddingLeft: 14, display: "flex", alignItems: "center" }}>
        <span
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "1.5px",
            color: "rgba(255,255,255,0.45)",
          }}
        >
          IF YOU CONTINUE AFTER DAY 7
        </span>
      </div>
    </div>
  );
}

function StepRow({
  step,
  isLast,
  connectorDashed,
}: {
  step: TimelineStep;
  isLast: boolean;
  connectorDashed: boolean;
}) {
  const dotColor = step.inTrial ? colors.white : GREEN;
  const solidConnectorColor = step.inTrial
    ? "rgba(255,255,255,0.35)"
    : "rgba(76,175,80,0.85)";

  return (
    <div style={{ display: "flex", alignItems: "stretch" }}>
      {/* Gutter: dot + connector */}
      <div
        style={{
          width: 28,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        <div
          style={{
            marginTop: 6,
            width: 12,
            height: 12,
            borderRadius: "50%",
            background: dotColor,
          }}
        />
        {!isLast && (
          <div
            style={{
              flex: 1,
              padding: "4px 0",
              display: "flex",
              justifyContent: "center",
              alignItems: "stretch",
              width: "100%",
            }}
          >
            {connectorDashed ? (
              <DashedVerticalLine height="100%" />
            ) : (
              <div style={{ width: 2, background: solidConnectorColor }} />
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          paddingLeft: 14,
          paddingBottom: isLast ? 0 : 20,
        }}
      >
        <div
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 18,
            fontWeight: 600,
            color: colors.white,
            lineHeight: 1.25,
            letterSpacing: "-0.2px",
          }}
        >
          {step.title}
        </div>
        <div style={{ height: 4 }} />
        <div
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 13,
            fontWeight: 400,
            color: colors.white,
            lineHeight: 1.45,
          }}
        >
          {step.body}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Optional "Free 20-min call with Aadi" bonus card
// ─────────────────────────────────────────────────────────────
function CallBonusCard() {
  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ height: 1, background: "rgba(255,255,255,0.08)" }} />
      <div style={{ height: 18 }} />
      <div
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "1.5px",
          color: GREEN,
        }}
      >
        PLUS
      </div>
      <div style={{ height: 8 }} />
      <div
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 17,
          fontWeight: 600,
          color: colors.white,
          lineHeight: 1.3,
          letterSpacing: "-0.3px",
        }}
      >
        Free 20-min personalized session with Aadi
      </div>
      <div style={{ height: 6 }} />
      <div
        style={{
          fontFamily: "Poppins, -apple-system, sans-serif",
          fontSize: 13,
          fontWeight: 400,
          color: "rgba(255,255,255,0.72)",
          lineHeight: 1.45,
        }}
      >
        Book right after starting your trial. We&apos;ll personalize it to your scalp and make sure nothing gets in your way.
      </div>
    </div>
  );
}
