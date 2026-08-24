"use client";

// Pre-paywall reveal — the single most important conversion moment in the
// funnel. Lands as a focused "aha" page: ONE big animation showing tight
// vs healthy vessels, with the user's own factors mapped onto the tight
// side. The mechanism becomes their personal mechanism.
//
// What this page is NOT: a wall of cards. The original version stacked 8
// sections (root causes, timeline, shed-warning, plan total, founder note)
// and the user got buried before reaching the takeaway. Cut that down to
// one focused arc — the heavy timeline + shed-warning context now lives
// on TreatmentReady, right before the buy.
//
// Both genders see this with audience-specific personal-factor mapping:
//   - Women: pulled from gender-coded triggerContext + hairSymptoms
//   - Men: pulled from familyHistory + stressFrequency + severity

import { useMemo } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import BloodVesselAnimation from "../components/BloodVesselAnimation";
import StepHeader from "../components/StepHeader";
import startStyles from "../start.module.css";

// Maps women's triggerContext multi-select selections to a short personal-
// factor label suitable for the diagnosis page list. First match wins —
// ordering reflects "if she picked multiple, name the most product-relevant."
const WOMEN_TRIGGER_LABELS: { match: string; label: string }[] = [
  { match: "Postpartum", label: "You're postpartum" },
  { match: "Perimenopause", label: "You're going through menopause" },
  { match: "After COVID", label: "Your hair fell out after COVID" },
  { match: "PCOS", label: "You have PCOS" },
  { match: "thyroid", label: "Your thyroid is off" },
  { match: "Hashimoto", label: "Your thyroid is off" },
  { match: "ferritin", label: "Your iron is low" },
  { match: "iron deficiency", label: "Your iron is low" },
  { match: "stress event", label: "You went through something stressful" },
  { match: "birth control", label: "You changed your birth control" },
  { match: "HRT", label: "You changed your HRT" },
  { match: "tight ponytails", label: "You wore tight hairstyles for years" },
];

function buildWomenFactors(
  triggers: string[] | undefined,
  symptoms: string[] | undefined
): string[] {
  const out: string[] = [];
  if (triggers && triggers.length) {
    for (const { match, label } of WOMEN_TRIGGER_LABELS) {
      if (triggers.some((t) => t.toLowerCase().includes(match.toLowerCase()))) {
        out.push(label);
        break;
      }
    }
  }
  if (symptoms && symptoms.length) {
    if (symptoms.some((s) => s.toLowerCase().includes("tender"))) {
      out.push("Your scalp feels sore");
    }
    if (symptoms.some((s) => s.toLowerCase().includes("part is wider"))) {
      out.push("Your part is wider");
    }
  }
  // Always include the universal scalp-tightness mechanism. Every woman
  // in the funnel is dealing with this regardless of which trigger she
  // picked, so it anchors the diagnosis even when nothing else matches.
  out.push("Your scalp is too tight");
  // Outcome line — every user in the funnel is here because hair fall is
  // continuing. Anchoring it as the last item makes the column read as a
  // cause-to-effect chain ending in the consequence.
  const trimmed = out.slice(0, 3);
  trimmed.push("Hair fall continues");
  return trimmed;
}

function buildMenFactors(
  hairLossLocation: string | undefined
): string[] {
  // Three lines that mirror the right-hand "with scalp exercises" column
  // beat-for-beat: tightness → blood-flow consequence → outcome. Lead with
  // the location-specific tightness so the user maps their own answer onto
  // their own scalp ("Your crown is tight" beats abstract "tension builds
  // up over time"). Stress / family history / severity intentionally omitted
  // — they're upstream causes of tightness, not the mechanism itself, and
  // adding them breaks the 1:1 parallel with the right column.
  const tight =
    hairLossLocation === "hairline"
      ? "Your hairline is tight"
      : hairLossLocation === "all_over"
        ? "Your entire scalp is tight"
        : "Your crown is tight"; // crown / part / fallback
  return [tight, "Poor blood flow to hair follicles", "Hair fall continues"];
}

function buildHealthyOutcomes(hairLossLocation: string | undefined): string[] {
  // Mirror the left column's location-specific tightness line so the two
  // columns read as exact 1:1 parallels: "Your crown is tight" → "Your
  // crown gets less tight", with the same anatomical word on each side.
  const looser =
    hairLossLocation === "hairline"
      ? "Your hairline gets less tight"
      : hairLossLocation === "all_over"
        ? "Your entire scalp gets less tight"
        : "Your crown gets less tight"; // crown / part / fallback
  return [looser, "Blood flow to hair improves", "Hair loss starts to reduce"];
}

// Six techniques — duplicated from TechniquesPreview so the women's plan
// reveal page can render them inline (TechniquesPreview itself auto-skips
// on women now; this page absorbs that content).
const TECHNIQUES = [
  { name: "Scalp Pinching", image: "/start/techniques/technique_scalp_pinching.png" },
  { name: "Acupressure", image: "/start/techniques/technique_acupressure.png" },
  { name: "Scalp Pressing", image: "/start/techniques/technique_scalp_pressing.png" },
  { name: "Neck Presses", image: "/start/techniques/technique_neck_presses.png" },
  { name: "Scalp Stretches", image: "/start/techniques/technique_scalp_stretches.png" },
  { name: "Neck Stretches", image: "/start/techniques/technique_neck_stretches.png" },
];

function locationSubhead(loc: string | undefined): string {
  if (loc === "hairline") return "your hairline thinning";
  if (loc === "all_over") return "your overall thinning";
  if (loc === "part") return "your widening part";
  if (loc === "crown") return "your crown thinning";
  return "your hair";
}

// Pull the most-relevant secondary axis from the rest of the woman's quiz
// answers — triggers (postpartum / perimenopause / stress event / thyroid /
// iron / etc.) take priority, then symptoms (tender / wider part / brush),
// so the subhead reads "Built for [location] and [trigger/symptom]" instead
// of a single shallow dimension.
function secondaryAxis(triggers: string[] | undefined, symptoms: string[] | undefined): string | null {
  const find = (haystack: string[] | undefined, needle: string) =>
    !!haystack?.some((x) => x.toLowerCase().includes(needle.toLowerCase()));
  if (find(triggers, "Postpartum")) return "postpartum shedding";
  if (find(triggers, "Perimenopause")) return "perimenopause changes";
  if (find(triggers, "Menopause")) return "menopause changes";
  if (find(triggers, "After COVID")) return "post-COVID shedding";
  if (find(triggers, "stress event")) return "stress-related shedding";
  if (find(triggers, "PCOS")) return "PCOS-related thinning";
  if (find(triggers, "thyroid") || find(triggers, "Hashimoto")) return "thyroid-related thinning";
  if (find(triggers, "ferritin") || find(triggers, "iron deficiency")) return "low-iron shedding";
  if (find(triggers, "tight ponytails")) return "tight-hairstyle damage";
  if (find(symptoms, "tender")) return "scalp tenderness";
  if (find(symptoms, "part is wider")) return "a widening part";
  if (find(symptoms, "ponytail")) return "thinner ponytail";
  return null;
}

// Maps pinch-test answer to the adjective the mobile diagnosis sentence
// uses. Kept 1:1 with mobile: muchTighter → 'very tight', aBitTighter →
// 'a little tight', tighter / aboutSame / missing → 'tight'.
function pinchAdjective(answer: string | undefined): string {
  if (answer === "muchTighter") return "very tight";
  if (answer === "aBitTighter") return "a little tight";
  return "tight";
}

// Mobile ships a scheduled check-in dated three days from today (MMM DD),
// which the user reads as a real commitment on the platform's side.
function followUpDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${months[d.getMonth()]} ${String(d.getDate()).padStart(2, "0")}`;
}

// Location-personalized focus bullet, matched to mobile's phrasing. The
// hairline branch is gender-aware — women see 'hairline and temples' while
// men see just 'hairline'.
function focusLine(
  hairLossLocation: string | undefined,
  isWomen: boolean
): string {
  if (hairLossLocation === "hairline") {
    return isWomen
      ? "Focus on your hairline and temples"
      : "Focus on your hairline";
  }
  if (hairLossLocation === "all_over") return "Focus on your entire scalp";
  if (hairLossLocation === "part") return "Focus on your part";
  if (hairLossLocation === "crown") return "Focus on your crown region";
  return "Focus on your whole scalp";
}

export default function PersonalizedDiagnosis() {
  const { answers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  const factors = useMemo(() => {
    if (isWomen) return buildWomenFactors(answers.triggerContext, answers.hairSymptoms);
    return buildMenFactors(answers.hairLossLocation);
  }, [isWomen, answers.triggerContext, answers.hairSymptoms, answers.hairLossLocation]);

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  // Women's funnel: plan-reveal page. Consolidates the original diagnosis
  // (mechanism animation + two-column comparison) and TechniquesPreview
  // (six technique cards) into one strong "your plan is ready" moment.
  // Modeled on Noom / Hers' custom-plan reveal — strongest pre-paywall
  // screen in the funnel. TechniquesPreview auto-skips on women now.
  if (isWomen) {
    const loc = locationSubhead(answers.hairLossLocation);
    const sec = secondaryAxis(answers.triggerContext, answers.hairSymptoms);
    const subhead = sec ? `Built for ${loc} and ${sec}.` : `Built for ${loc}.`;
    const pinchAdj = pinchAdjective((answers as { pinchTestAnswer?: string }).pinchTestAnswer);
    const followUp = followUpDate();
    return (
      <div className={startStyles.stepBody}>
        <StepHeader onBack={back} />
        <div className={startStyles.stepInner} style={{ paddingBottom: 24 }}>
          <h1 className={startStyles.headline} style={{ fontSize: 28 }}>
            Your plan is ready
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--fg-55)",
              marginTop: 6,
              marginBottom: 16,
            }}
          >
            {subhead}
          </p>

          {/* Mechanism animation — visual anchor for what the plan
              addresses. Replaces the two-column comparison; the inline
              callout below explains it in one line. */}
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              margin: "8px 0 4px",
            }}
          >
            <BloodVesselAnimation width={320} height={200} />
          </div>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--fg-75)",
              textAlign: "left",
              margin: "0 0 24px",
            }}
          >
            Your scalp is {pinchAdj} right now, and that&apos;s blocking blood flow to your hair. Here&apos;s how we&apos;re going to fix it.
          </p>

          {/* Six techniques grid — same thumbnails as TechniquesPreview,
              now living inside the plan-reveal page so the user sees
              exactly what they're getting before the paywall. */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 10,
              marginBottom: 20,
            }}
          >
            {TECHNIQUES.map((t) => (
              <div
                key={t.name}
                style={{
                  position: "relative",
                  aspectRatio: "0.85",
                  borderRadius: 14,
                  overflow: "hidden",
                  background: "var(--fg-4)",
                }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={t.image}
                  alt={t.name}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 50%)",
                  }}
                />
                <div
                  style={{
                    position: "absolute",
                    left: 12,
                    right: 12,
                    bottom: 10,
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 600,
                    textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                  }}
                >
                  {t.name}
                </div>
              </div>
            ))}
          </div>

          {/* Doctor's-plan list — replaces the previous "20 min · 60 days
              · 6 techniques" stats row. Reads as a prescription / protocol
              brief, which is the framing women trust at this point in the
              funnel. Day-by-day timeline lives on the paywall (Journey
              timeline) so it isn't duplicated here. */}
          <div
            style={{
              padding: "16px 0",
              borderTop: "1px solid var(--fg-8)",
              borderBottom: "1px solid var(--fg-8)",
              marginBottom: 16,
            }}
          >
            {[
              "Scalp massages + neck work",
              "Video-guided routine",
              "9 to 17 minutes every day",
              "Recommended to do before bed",
              focusLine(answers.hairLossLocation, true),
              "Message Aadi & team anytime",
            ].map((line) => (
              <div
                key={line}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "6px 0",
                  fontSize: 14,
                  lineHeight: 1.4,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path
                    d="M2 7L6 11L12 4"
                    stroke="var(--text)"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                <span>{line}</span>
              </div>
            ))}
          </div>

          {/* FOLLOW-UP block — dated commitment three days out, mirrors
              the mobile plan-reveal check-in eyebrow. */}
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.8,
              textTransform: "uppercase",
              color: "var(--fg-55)",
              margin: "0 0 4px",
            }}
          >
            FOLLOW-UP · {followUp}
          </p>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.5,
              color: "var(--fg-75)",
              margin: "0 0 16px",
            }}
          >
            In 3 days, we&apos;ll check if your scalp is starting to get looser.
          </p>

          {/* Reassurance / sign-off — removes the "do I also need supplements
              or a diet?" friction right before the CTA. */}
          <p
            style={{
              fontSize: 13,
              lineHeight: 1.5,
              color: "var(--fg-55)",
              fontStyle: "italic",
              margin: "0 0 16px",
            }}
          >
            No medication, supplements, diet, or lifestyle changes needed. Most members see results with the routine alone.
          </p>

          {/* Trust footer — App Store rating + member count. */}
          <p
            style={{
              fontSize: 12,
              color: "var(--fg-55)",
              textAlign: "center",
              margin: 0,
            }}
          >
            4.8 on the App Store · 25,000+ members
          </p>
        </div>

        <div className={startStyles.buttonRow}>
          <button
            type="button"
            className={startStyles.button}
            onClick={handleContinue}
          >
            Continue
          </button>
        </div>
      </div>
    );
  }

  // Men's funnel — plan-reveal beat matching mobile plan_reveal. Keeps the
  // web-only two-column comparison as the visual anchor and adds the mobile
  // plan-list block (bullets + follow-up + reassurance + trust footer)
  // underneath so the men's branch stops framing this as a diagnostic reveal
  // and starts framing it as the plan hand-off.
  const menPinchAdj = pinchAdjective((answers as { pinchTestAnswer?: string }).pinchTestAnswer);
  const menFollowUp = followUpDate();
  return (
    <div className={startStyles.stepBody}>
      <StepHeader onBack={back} />
      <div
        className={startStyles.stepInner}
        style={{ paddingBottom: 24 }}
      >
        <h1
          className={startStyles.headline}
          style={{ fontSize: 28 }}
        >
          Your plan is ready
        </h1>
        <p
          style={{
            fontSize: 15,
            lineHeight: 1.5,
            color: "var(--fg-75)",
            marginTop: 6,
            marginBottom: 16,
          }}
        >
          Your scalp is {menPinchAdj} right now, and that&apos;s blocking blood flow to your hair. Here&apos;s how we&apos;re going to fix it.
        </p>

        {/* Hero animation — the page's single visual anchor. The two
            columns underneath read directly off the two vessels. */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            margin: "8px 0 8px",
          }}
        >
          <BloodVesselAnimation width={320} height={200} />
        </div>

        {/* Two-column comparison. Left mirrors the "Tight" vessel and lists
            THEIR personal factors. Right mirrors "Healthy" and shows where
            the protocol takes them. The user reads their own answers back
            on the left, which is the aha. */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 12,
            marginTop: 8,
            marginBottom: 20,
          }}
        >
          <FactorColumn
            tone="tight"
            label="Current"
            items={factors}
          />
          <FactorColumn
            tone="healthy"
            label="With scalp exercises"
            items={buildHealthyOutcomes(answers.hairLossLocation)}
          />
        </div>

        {/* Doctor's-plan list — mirrors mobile plan_reveal so the men's
            branch reads as the plan hand-off, not just a diagnosis reveal. */}
        <div
          style={{
            padding: "16px 0",
            borderTop: "1px solid var(--fg-8)",
            borderBottom: "1px solid var(--fg-8)",
            marginBottom: 16,
          }}
        >
          {[
            "Scalp exercises + neck work",
            "Video-guided routine",
            "9 to 17 minutes every day",
            "Recommended to do before bed",
            focusLine(answers.hairLossLocation, false),
            "Message Aadi & team anytime",
          ].map((line) => (
            <div
              key={line}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "6px 0",
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M2 7L6 11L12 4"
                  stroke="var(--text)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span>{line}</span>
            </div>
          ))}
        </div>

        {/* FOLLOW-UP block — dated commitment three days out, mirrors
            the mobile plan-reveal check-in eyebrow. */}
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: 0.8,
            textTransform: "uppercase",
            color: "var(--fg-55)",
            margin: "0 0 4px",
          }}
        >
          FOLLOW-UP · {menFollowUp}
        </p>
        <p
          style={{
            fontSize: 14,
            lineHeight: 1.5,
            color: "var(--fg-75)",
            margin: "0 0 16px",
          }}
        >
          In 3 days, we&apos;ll check if your scalp is starting to get looser.
        </p>

        {/* Reassurance / sign-off — removes the "do I also need supplements
            or a diet?" friction right before the CTA. */}
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: "var(--fg-55)",
            fontStyle: "italic",
            margin: "0 0 16px",
          }}
        >
          No medication, supplements, diet, or lifestyle changes needed. Most members see results with the routine alone.
        </p>

        {/* Trust footer — App Store rating + member count. */}
        <p
          style={{
            fontSize: 12,
            color: "var(--fg-55)",
            textAlign: "center",
            margin: 0,
          }}
        >
          4.8 on the App Store · 25,000+ members
        </p>
      </div>

      <div className={startStyles.buttonRow}>
        <button
          type="button"
          className={startStyles.button}
          onClick={handleContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

function FactorColumn({
  tone,
  label,
  items,
}: {
  tone: "tight" | "healthy";
  label: string;
  items: string[];
}) {
  // Color tokens align with BloodVesselAnimation: tight = red-tinted,
  // healthy = green-tinted. Subtle so the columns feel anchored to the
  // diagram without overpowering the rest of the page.
  const accent = tone === "tight" ? "#DC3545" : "#359033";
  return (
    <div
      style={{
        background: "var(--fg-4)",
        border: "1px solid var(--fg-8)",
        borderRadius: 14,
        padding: "14px 14px 16px",
      }}
    >
      <p
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: 0.8,
          textTransform: "uppercase",
          color: accent,
          margin: 0,
          marginBottom: 10,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {label}
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((item) => (
          <li
            key={item}
            style={{
              fontSize: 13,
              lineHeight: 1.4,
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
            }}
          >
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: 3,
                background: accent,
                marginTop: 7,
                flexShrink: 0,
              }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
