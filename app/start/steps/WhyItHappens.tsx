"use client";

// /mandy women's funnel — replaces the male-narrated founder story with a
// 4-beat visual explainer of the mechanism. Each slide leads with an inline
// SVG diagram (theme-aware via currentColor) and a single short sentence.
// Auto-skips on every other route so adding this step to STEP_ORDER doesn't
// affect /startus3, /startindia, /startfree, etc.

import { useEffect, useState, type ReactNode } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import BloodVesselAnimation from "../components/BloodVesselAnimation";

interface Beat {
  title: string;
  body?: string;
  Illustration: () => ReactNode;
}

// Slide 1 — scalp + pinch fingers + "tight" indicator. Two stylized
// fingertips closing on a flat scalp surface, with a tiny no-movement bar.
function PinchIllustration() {
  return (
    <svg viewBox="0 0 240 180" fill="none" aria-hidden="true">
      {/* Left finger */}
      <path
        d="M75 20 L75 95 Q75 108 88 108 Q101 108 101 95 L101 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right finger */}
      <path
        d="M139 20 L139 95 Q139 108 152 108 Q165 108 165 95 L165 20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Pinched skin fold between fingers */}
      <path
        d="M101 102 Q120 116 139 102"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="currentColor"
        fillOpacity="0.06"
      />
      {/* Scalp surface */}
      <path
        d="M20 130 Q120 124 220 130"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Hair follicles below */}
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.4">
        <path d="M40 132 L40 158" />
        <path d="M70 132 L70 158" />
        <path d="M170 132 L170 158" />
        <path d="M200 132 L200 158" />
      </g>
      {/* "Tight" indicator — short horizontal bar with brackets */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55">
        <path d="M105 88 L135 88" />
        <path d="M105 84 L105 92" />
        <path d="M135 84 L135 92" />
      </g>
    </svg>
  );
}

// Slide 2 — cross-section of scalp with stress/tension marks accumulating
// in the muscle layer. Top = skin curve, middle band = muscle (with tension
// hatch marks), bottom = follicles.
function TensionIllustration() {
  return (
    <svg viewBox="0 0 280 180" fill="none" aria-hidden="true">
      {/* Skin surface */}
      <path
        d="M20 36 Q140 22 260 36"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
      {/* Muscle layer band (subtle fill) */}
      <path
        d="M20 36 Q140 22 260 36 L260 78 Q140 64 20 78 Z"
        fill="currentColor"
        fillOpacity="0.05"
        stroke="none"
      />
      <path
        d="M20 78 Q140 64 260 78"
        stroke="currentColor"
        strokeWidth="1"
        strokeOpacity="0.3"
        fill="none"
      />
      {/* Tension marks — zigzag clusters in the muscle layer */}
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity="0.85">
        <path d="M55 50 l4 -6 l4 6 l4 -6 l4 6" />
        <path d="M120 46 l4 -6 l4 6 l4 -6 l4 6" />
        <path d="M185 52 l4 -6 l4 6 l4 -6 l4 6" />
      </g>
      {/* Vessel layer */}
      <rect x="20" y="92" width="240" height="6" rx="3" fill="currentColor" fillOpacity="0.55" />
      {/* Follicles */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M40 110 L40 158" />
        <path d="M85 110 L85 158" />
        <path d="M130 110 L130 158" />
        <path d="M175 110 L175 158" />
        <path d="M220 110 L220 158" />
      </g>
      {/* Stress label arrows from above */}
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
        <path d="M70 8 L70 24" />
        <path d="M66 18 L70 24 L74 18" fill="none" />
        <path d="M140 8 L140 24" />
        <path d="M136 18 L140 24 L144 18" fill="none" />
        <path d="M210 8 L210 24" />
        <path d="M206 18 L210 24 L214 18" fill="none" />
      </g>
    </svg>
  );
}

// Slide 3 — uses the shared animated blood vessel diagram (same one in
// FounderStory). Shows a pinched "Tight" vessel with stuck red cells next
// to a "Healthy" vessel with flowing cells. Already conveys the mechanism
// AND the contrast in one image, so slide 4 can pivot to the routine.
function SqueezedIllustration() {
  return (
    <div style={{ width: "100%", height: "100%", display: "flex", justifyContent: "center", alignItems: "center" }}>
      <BloodVesselAnimation
        width={320}
        height={200}
      />
    </div>
  );
}

// Slide 4 — clock + scalp routine graphic. Slide 3 already shows the
// vessel before/after, so slide 4 anchors the time commitment instead:
// a circular clock with "10–15 min" inside, plus a scalp + hands icon
// underneath to suggest the routine itself.
function RoutineIllustration() {
  return (
    <svg viewBox="0 0 280 200" fill="none" aria-hidden="true">
      {/* Clock face */}
      <circle
        cx="140"
        cy="68"
        r="50"
        stroke="currentColor"
        strokeWidth="2.2"
        fill="currentColor"
        fillOpacity="0.04"
      />
      {/* Tick marks at 12 / 3 / 6 / 9 */}
      <g stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4">
        <path d="M140 22 L140 30" />
        <path d="M140 106 L140 114" />
        <path d="M94 68 L102 68" />
        <path d="M178 68 L186 68" />
      </g>
      {/* "10–15 MIN" label inside the clock */}
      <text
        x="140"
        y="64"
        textAnchor="middle"
        fill="currentColor"
        fontSize="18"
        fontWeight="700"
        fontFamily="Poppins, sans-serif"
        letterSpacing="-0.4"
      >
        10–15
      </text>
      <text
        x="140"
        y="84"
        textAnchor="middle"
        fill="currentColor"
        fillOpacity="0.55"
        fontSize="10"
        fontWeight="600"
        fontFamily="Poppins, sans-serif"
        letterSpacing="1.5"
      >
        MIN / DAY
      </text>
      {/* Scalp + hands icon below the clock */}
      <g
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        {/* Head silhouette (back view) */}
        <path d="M105 168 Q140 130 175 168" />
        {/* Two hands resting on top */}
        <path d="M118 154 L118 144 Q118 138 124 138 Q130 138 130 144 L130 154" />
        <path d="M150 154 L150 144 Q150 138 156 138 Q162 138 162 144 L162 154" />
      </g>
    </svg>
  );
}

const BEATS: Beat[] = [
  {
    title: "Your scalp probably barely moved.",
    body: "That's the thing most women losing hair never think to look at.",
    Illustration: PinchIllustration,
  },
  {
    title: "Stress and hormones tighten it over years.",
    body: "It happens slowly enough to feel normal.",
    Illustration: TensionIllustration,
  },
  {
    title: "That tightness pinches the blood vessels shut.",
    body: "Without blood reaching the roots, new hairs come in thinner each cycle.",
    Illustration: SqueezedIllustration,
  },
  {
    title: "10 to 15 minutes a day brings the blood back.",
    body: "Most women feel a looser scalp inside two weeks.",
    Illustration: RoutineIllustration,
  },
];

export default function WhyItHappens() {
  const { next } = useFlow();
  const config = useFunnelConfig();

  // Women's funnels no longer use any pre-quiz story page — the mechanism
  // is now taught through educational interstitials inside the quiz itself
  // (HairLossRateResponse, StressFrequencyResponse, PersonalizedDiagnosis
  // tie-together). So this step auto-skips on women everywhere, and is
  // effectively unused unless re-enabled.
  const shouldRender = false;

  const beats: Beat[] = BEATS;

  useEffect(() => {
    if (!shouldRender) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldRender]);

  const [index, setIndex] = useState(0);

  if (!shouldRender) return null;

  const beat = beats[index];
  const isLast = index >= beats.length - 1;
  const Illustration = beat.Illustration;

  const advance = () => {
    if (isLast) {
      mediumHaptic();
      next();
      return;
    }
    lightHaptic();
    setIndex((i) => i + 1);
  };

  const goBack = () => {
    if (index <= 0) return;
    lightHaptic();
    setIndex((i) => i - 1);
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#FAF7F2",
        color: "#1A1A1A",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Poppins, -apple-system, sans-serif",
      }}
    >
      {/* Progress bar */}
      <div
        style={{
          display: "flex",
          gap: 4,
          padding: "16px 20px 0",
        }}
      >
        {beats.map((_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 2,
              background: i <= index ? "#1A1A1A" : "rgba(26,26,26,0.15)",
              transition: "background 200ms ease",
            }}
          />
        ))}
      </div>

      {/* Tap zones overlay */}
      <div style={{ position: "relative", flex: 1 }}>
        <button
          type="button"
          aria-label="Go back"
          onClick={goBack}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            bottom: 0,
            width: "30%",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            zIndex: 1,
          }}
        />
        <button
          type="button"
          aria-label="Continue"
          onClick={advance}
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            bottom: 0,
            width: "70%",
            background: "transparent",
            border: 0,
            cursor: "pointer",
            zIndex: 1,
          }}
        />

        {/* Beat content */}
        <div
          key={`beat-${index}`}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            alignItems: "center",
            padding: "0 32px",
            animation: "mandyFade 400ms ease-out",
            gap: 28,
          }}
        >
          {/* Hero illustration — sized to take roughly half the height */}
          <div
            style={{
              width: "100%",
              maxWidth: 360,
              maxHeight: "42vh",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <Illustration />
          </div>
          <div style={{ width: "100%", maxWidth: 520, textAlign: "center" }}>
            <h1
              style={{
                fontSize: 26,
                fontWeight: 600,
                lineHeight: 1.25,
                letterSpacing: "-0.6px",
                margin: 0,
              }}
            >
              {beat.title}
            </h1>
            {beat.body && (
              <p
                style={{
                  fontSize: 16,
                  fontWeight: 400,
                  lineHeight: 1.5,
                  color: "rgba(26,26,26,0.6)",
                  marginTop: 12,
                }}
              >
                {beat.body}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div
        style={{
          padding: "20px 32px calc(env(safe-area-inset-bottom) + 32px)",
          textAlign: "center",
        }}
      >
        {isLast ? (
          <button
            type="button"
            onClick={advance}
            style={{
              width: "100%",
              maxWidth: 360,
              padding: "16px 28px",
              background: "#1A1A1A",
              color: "#FAF7F2",
              border: 0,
              borderRadius: 999,
              fontSize: 16,
              fontWeight: 500,
              fontFamily: "inherit",
              cursor: "pointer",
            }}
          >
            Continue
          </button>
        ) : (
          <p
            style={{
              fontSize: 13,
              color: "rgba(26,26,26,0.4)",
              margin: 0,
            }}
          >
            Tap to continue
          </p>
        )}
      </div>

      <style jsx>{`
        @keyframes mandyFade {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
