"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { fbqTrackOnce } from "../lib/fb-pixel";
import { ttqTrackOnce } from "../lib/tiktok-pixel";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { warmup as warmupRC } from "../lib/revenuecat";
import PlanModal, { type PlanTier } from "../components/PlanModal";
import Us3PlanModal, { type Us3PlanTier } from "../components/Us3PlanModal";
import IndiaPlanModal, { type IndiaPlanTier } from "../components/IndiaPlanModal";
import India2PlanModal, { type India2PlanTier } from "../components/India2PlanModal";
import IndiaSinglePlanModal, { type IndiaSinglePlanTier } from "../components/IndiaSinglePlanModal";
import TrialInfoPageIndiaPremium from "../components/TrialInfoPageIndiaPremium";
import TrialInfoPage from "../components/TrialInfoPage";
import TrialInfoPageUS from "../components/TrialInfoPageUS";
import Us3TrialInfo from "../components/Us3TrialInfo";
import type { SupportNeed } from "../lib/types";
import styles from "./trial-paywall.module.css";

const TECHNIQUE_IMAGES = [
  "/start/techniques/technique_scalp_pinching.png",
  "/start/techniques/technique_acupressure.png",
  "/start/techniques/technique_scalp_pressing.png",
  "/start/techniques/technique_neck_presses.png",
  "/start/techniques/technique_scalp_stretches.png",
  "/start/techniques/technique_neck_stretches.png",
];

// 5 free guides bundled with the trial. Same list shown on Us3TrialInfo —
// keep them in sync. The "$19 each / $95 total" framing is the asymmetric-
// offer anchor: users perceive the guides as a $95 gift on top of the
// free trial, making the "yours to keep even if you cancel" copy land
// with real dollar value rather than vague bonus content.
//
// Men's set (/startus3) — contrarian-protocol angle (#1 = 60-day rule
// without minox/fin) plus tactical guides shaped around the same topics
// as the women's bundle (vitamins, shampoo ingredients, shower routine).
// Guide 5 is men-specific (dermaroller-without-scarring).
const PAYWALL_GUIDES_MEN = [
  { src: "/start/guides/KESHAH_Men_Guide_01_Method.png", title: "60-day rule to see results without minoxidil or finasteride" },
  { src: "/start/guides/KESHAH_Men_Guide_02_Vitamins.png", title: "What vitamins actually matter (most are a waste of money)" },
  { src: "/start/guides/KESHAH_Men_Guide_03_Shampoo.png", title: "Ingredients that damage scalp health (check your shampoo)" },
  { src: "/start/guides/KESHAH_Men_Guide_04_Dandruff.png", title: "3 minute shower routine to fix dandruff or oily scalp" },
  { src: "/start/guides/KESHAH_Men_Guide_05_Dermaroller.png", title: "How to dermaroll without scarring your scalp" },
];

// Women's set (/mandy, /f/jennifer, /f/donna) — contrarian-hormones angle
// (#1) plus tactical guides shaped around the women's-audience research
// (styling damage, vitamin verdict, shampoo ingredients, shower routine).
const PAYWALL_GUIDES_WOMEN = [
  { src: "/start/guides/KESHAH_Women_Guide_01_Method.png", title: "60-day rule to see results without touching your hormones" },
  { src: "/start/guides/KESHAH_Women_Guide_02_Styling.png", title: "How to blowdry and straighten your hair without damaging it" },
  { src: "/start/guides/KESHAH_Women_Guide_03_Vitamins.png", title: "What vitamins actually matter (most are a waste of money)" },
  { src: "/start/guides/KESHAH_Women_Guide_04_Shampoo.png", title: "Ingredients that damage scalp health (check your shampoo)" },
  { src: "/start/guides/KESHAH_Women_Guide_05_Dandruff.png", title: "3 minute shower routine to fix dandruff or oily scalp" },
];

const SUPPORT_FULL: Record<SupportNeed, string> = {
  get_off_medication: "Get off medication",
  fix_dandruff: "Fix dandruff & oily scalp",
  dht_hormones: "DHT & hormone support",
  stress: "Stress management",
  bloodwork_vitamins: "Blood work & vitamins",
  diet: "Diet guidance",
};

// NOTE: MONTHS / targetDate() / ordinalSuffix() were removed when the
// subhead switched to the mobile 7-day risk-reversal sentence (no
// `${month}` personalization). Restore them here before wiring any
// future variant that needs a personalized target date.

export default function TrialPaywall() {
  const { answers, next, updateAnswers } = useFlow();
  const [modalOpen, setModalOpen] = useState(false);
  // Us3 + women's-creator funnels show a "try free / guides + worst-best"
  // intermediate page after Continue, before the plan modal opens. Other
  // funnel variants (India, /startfree, legacy /start) keep the direct-to-
  // modal behaviour they were validated on.
  const [trialInfoOpen, setTrialInfoOpen] = useState(false);

  const isIndia =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startindia");
  // /startindiafree variant routes to the trial modal (1-day free trial on
  // the 3-month plan) instead of the direct-buy plan modal.
  const isIndiaTrial =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startindiafree") &&
    !window.location.pathname.startsWith("/startindiafree2");
  // /startindiafree2 — premium trial: 1-day free → ₹999/month.
  const isIndiaPremiumTrial =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startindiafree2");
  // /startindia2 variant tests weekly-decoy + monthly-winner pricing.
  const isIndia2 =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startindia2");
  // /startindia3 — single-tier paid-traffic paywall (no decoy).
  // Hypothesis: cold paid traffic converts higher with one clear option.
  const isIndia3 =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startindia3");
  // /startfree (US) — 1-day free trial → $99/year via RC web billing.
  const isUsFree =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startfree");
  // /startus2 — same flow as /start, plus the Hims-style Treatment Details
  // FAQ accordion above the sticky CTA. No pricing or product changes.
  const isUs2 =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startus2");
  // /startus3 — Meta-acquisition variant. Weekly $9.99 anchor + Monthly
  // $19.99 with 3-day trial. Lower entry price + trial reduces commitment
  // friction for cold low-trust audience.
  const isUs3 =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/startus3");
  // /mandy — legacy mapping. New creators use /c/{slug} which resolves
  // through the funnel config below.
  const isMandy =
    typeof window !== "undefined" &&
    window.location.pathname.startsWith("/mandy");
  // Funnel config — drives headline, FAQ visibility, paywall variant for
  // /c/{slug} routes. Falls back to the legacy isXxx checks for the older
  // hard-coded routes (/startus2, /startus3, /mandy).
  const funnelConfig = useFunnelConfig();
  const useWomenWellnessFrame =
    isMandy || funnelConfig.audience === "women";

  useEffect(() => {
    fbqTrackOnce("ViewContent", { content_name: "TrialPaywall" });
    ttqTrackOnce("ViewContent", {
      contents: [{
        content_id: "trial_paywall",
        content_type: "product",
        content_name: "TrialPaywall",
      }],
    });
    if (!isIndia) {
      warmupRC();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Base items everyone gets — always rendered. Women's funnels swap the
  // Aadi-named support line for a generic version — Aadi is a man and his
  // name doesn't carry recognition (or fit) on a women's funnel where the
  // creator (Jennifer/Donna) is the trusted face.
  const baseItems = useMemo(
    () => [
      useWomenWellnessFrame
        ? "Daily video-guided scalp massages"
        : "Daily video-guided scalp exercises",
      useWomenWellnessFrame
        ? "1:1 chat support with scalp specialists"
        : "1:1 support from Aadi",
    ],
    [useWomenWellnessFrame]
  );

  // Personal items from the user's support needs picks. Capped at 4 so the
  // card doesn't get too tall on power users who picked all 6. Section is
  // hidden entirely if user picked nothing.
  const personalItems = useMemo(
    () => (answers.supportNeeds ?? []).slice(0, 4).map((id) => SUPPORT_FULL[id]),
    [answers.supportNeeds]
  );

  // Us3 path (/startus3, /mandy, /f/{slug}) routes through the trial-info
  // page so the user sees the offer + guides + worst-case/best-case framing
  // before the pricing modal. All other variants keep the legacy direct-
  // to-modal behaviour.
  const usesUs3TrialInfo =
    isUs3 || isMandy || funnelConfig.pricing === "us3";

  const handleContinue = () => {
    mediumHaptic();
    if (usesUs3TrialInfo) {
      setTrialInfoOpen(true);
    } else {
      setModalOpen(true);
    }
  };

  const handlePurchaseSuccess = (tier: PlanTier | IndiaPlanTier | India2PlanTier | IndiaSinglePlanTier | Us3PlanTier | "monthlyPremium") => {
    // eslint-disable-next-line no-console
    console.log("[paywall] Purchase succeeded", { tier, answers, isIndia });
    // Persist the tier so SignUp → save-profile can write it to Firestore
    // for affiliate commission reporting.
    updateAnswers({ purchaseTier: tier });
    next();
  };

  return (
    <div className={styles.root}>
      <div className={styles.scroll}>
        <div className={styles.inner}>
          {/* Header — matches the mobile 7-day trial paywall: trial-first
              headline + risk-reversal subhead. funnelConfig overrides still
              honored so per-creator funnels can swap in bespoke copy. */}
          <div className={styles.header}>
            <h1 className={styles.headline}>
              {funnelConfig.headlineOverride ?? "Try KESHAH free for a week."}
            </h1>
            <p className={styles.subhead}>
              {funnelConfig.subheadOverride
                ?? "If your scalp feels looser in 7 days, keep going. If not, cancel and pay nothing."}
            </p>
          </div>

          {/* Technique card */}
          <div className={styles.techniqueCard}>
            <div className={styles.techniqueRow}>
              {TECHNIQUE_IMAGES.map((src) => (
                <div key={src} className={styles.techniqueCell}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className={styles.techniqueImg} />
                </div>
              ))}
            </div>
            <div className={styles.includes}>
              {baseItems.map((label) => (
                <div key={label} className={styles.includeRow}>
                  <CheckIcon />
                  <span className={styles.includeText}>{label}</span>
                </div>
              ))}
              {personalItems.length > 0 && (
                <>
                  <div className={styles.includesDivider} />
                  <div className={styles.includesPersonalLabel}>ADDED FOR YOU</div>
                  {personalItems.map((label) => (
                    <div key={label} className={styles.includeRow}>
                      <CheckIcon />
                      <span className={styles.includeText}>{label}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Aadi's Guarantee block lives in the PlanModal now — appears
              when the user taps Continue and the modal slides up. */}

          {/* 5 free guides bundled with the trial — only shown for the
              Us3-pricing variants (US/men + women's-creator funnels). The
              cross-out price per row anchors the $95-total claim so the
              "yours to keep, even if you cancel" line on the trial-info
              page has a concrete dollar amount to land against. */}
          {usesUs3TrialInfo && (
            <div className={styles.guidesSection}>
              <div className={styles.guidesHeader}>
                <div className={styles.guidesLabel}>PLUS 5 FREE GUIDES</div>
                <div className={styles.guidesValueBadge}>$95 VALUE</div>
              </div>
              <div className={styles.guidesList}>
                {(useWomenWellnessFrame ? PAYWALL_GUIDES_WOMEN : PAYWALL_GUIDES_MEN).map((g) => (
                  <div key={g.src} className={styles.guideRow}>
                    <div className={styles.guideThumb}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={g.src}
                        alt=""
                        className={styles.guideThumbImg}
                        style={{ width: "100%", height: "100%" }}
                      />
                    </div>
                    <div className={styles.guideTitle}>{g.title}</div>
                    <div className={styles.guidePrice}>
                      <span className={styles.guidePriceOriginal}>$19</span>
                      <span className={styles.guidePriceFree}>Included</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Journey timeline — sits before the bonuses card so the core
              outcome promise (Day 1–3 → Day 60) wins the higher slot.
              Bonuses are nice-to-have value; Journey is the trust-building
              chain that earns the click. */}
          <div className={styles.timelineSection}>
            <div className={styles.sectionLabel}>YOUR JOURNEY</div>
            <Timeline />
          </div>

          {/* Bonuses ("YOUR PLAN INCLUDES") card removed — the 60-day refund
              guarantee on the plan modal now carries the risk-reversal work
              the bonuses list used to share, and the paywall reads tighter
              without it. */}

          {/* Treatment details (Hims-style FAQ) — gated on funnel config + legacy paths */}
          {(isUs2 || isUs3 || isMandy || funnelConfig.faqEnabled) && (
            <div className={styles.detailsSection}>
              <div className={styles.sectionLabel}>TREATMENT DETAILS</div>
              <TreatmentDetails />
            </div>
          )}

          {/* Social proof */}
          <div className={styles.proof}>
            <span className={styles.appleIcon}></span>
            <span className={styles.proofStars}>★★★★★</span>
            <span className={styles.proofText}>4.8 on the App Store · 26,538+ members</span>
          </div>
        </div>
      </div>

      {/* Sticky CTA — mobile parity: 3-month pricing disclosure sits above
          the button so the commitment is visible on the paywall itself,
          not deferred to the plan modal. Fine print under the button
          mirrors the mobile "no payment today" reassurance. */}
      <div className={styles.cta}>
        <div
          style={{
            maxWidth: 560,
            margin: "0 auto 10px",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.45,
            color: "var(--text-70)",
          }}
        >
          Plan starts at <strong style={{ fontWeight: 600, color: "var(--text)" }}>$33/month</strong>
          {" "}(3-month commitment. Billed as $99 every 3 months). Cancel anytime.
        </div>
        <button type="button" className={styles.ctaButton} onClick={handleContinue}>
          Try 7 days free
        </button>
        <div className={styles.ctaSub}>No payment today. Cancel in app anytime.</div>
      </div>

      {isUsFree && modalOpen ? (
        <TrialInfoPageUS
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={() => {
            setModalOpen(false);
            handlePurchaseSuccess("annual");
          }}
        />
      ) : isIndiaTrial && modalOpen ? (
        <TrialInfoPage
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={() => {
            setModalOpen(false);
            handlePurchaseSuccess("threeMonth");
          }}
        />
      ) : isIndiaPremiumTrial && modalOpen ? (
        <TrialInfoPageIndiaPremium
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={() => {
            setModalOpen(false);
            handlePurchaseSuccess("monthlyPremium");
          }}
        />
      ) : isIndia3 ? (
        <IndiaSinglePlanModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      ) : isIndia2 ? (
        <India2PlanModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      ) : isIndia ? (
        <IndiaPlanModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      ) : usesUs3TrialInfo ? (
        trialInfoOpen && (
          <Us3TrialInfo
            onClose={() => setTrialInfoOpen(false)}
            onPurchaseSuccess={() => {
              setTrialInfoOpen(false);
              handlePurchaseSuccess("threeMonthTrial");
            }}
          />
        )
      ) : (
        <PlanModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          onPurchaseSuccess={handlePurchaseSuccess}
        />
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M2 7.5L5.5 11L12 4"
        stroke="var(--text)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// FAQ accordion for /startus2 — four highest-leverage pre-purchase questions.
// Skips "what you'll do daily" (TechniquesPreview already showed it) and
// "how to cancel" (CTA subtitle already says cancel anytime). Replaces them
// with the two questions users actually weigh at the paywall: will this work
// for me, and why not just take the drugs?
//
// "The science" is a swipeable carousel of three real papers from the
// scalp-tension / mechanical-stimulation literature. All three are real and
// publicly searchable; verify before swapping copy.
const SCIENCE_PAPERS: Array<{ meta: string; title: string; finding: string }> = [
  {
    meta: "Byun et al. · 2015",
    title: "Scalp tension maps to hair loss pattern",
    finding:
      "The tightest regions of the scalp — hairline and crown — are exactly where hair loss starts.",
  },
  {
    meta: "Koyama et al. · Eplasty 2016",
    title: "Daily massage increased hair thickness",
    finding:
      "4 minutes a day for 24 weeks measurably thickened hair. Mechanical stretching upregulates hair-growth genes.",
  },
  {
    meta: "English & Barazesh · 2020",
    title: "Self-massage for androgenic alopecia",
    finding:
      "Of hundreds following a standardized protocol, most reported stabilization or visible improvement after 6+ months.",
  },
];

// FAQ items vary by gender — see TreatmentDetails component below.
// SCIENCE_PAPERS is also gender-filtered (Byun explicitly says "men", so it's
// hidden for female users).

// Horizontal snap carousel of science citations. CSS scroll-snap drives the
// snapping; an onScroll listener computes which card is in view to update
// the active dot. Touch-swipe works natively on mobile, scroll wheel + drag
// on desktop. The Byun paper is filtered out for female users — its summary
// explicitly references "where men lose hair first".
function ScienceCarousel({ isFemale }: { isFemale: boolean }) {
  const [active, setActive] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const papers = isFemale
    ? SCIENCE_PAPERS.filter((p) => !p.meta.startsWith("Byun"))
    : SCIENCE_PAPERS;

  const handleScroll = () => {
    const el = ref.current;
    if (!el) return;
    const firstCard = el.firstElementChild as HTMLElement | null;
    if (!firstCard) return;
    // Card width + gap is the per-page distance. Round() picks the nearest.
    const stride = firstCard.offsetWidth + 10;
    const idx = Math.round(el.scrollLeft / stride);
    setActive(Math.max(0, Math.min(papers.length - 1, idx)));
  };

  return (
    <div className={styles.scienceWrap}>
      <div className={styles.scienceHint}>
        <span>Peer-reviewed research</span>
        <span className={styles.scienceCounter}>
          {active + 1} / {papers.length}
        </span>
      </div>
      <div ref={ref} className={styles.scienceScroll} onScroll={handleScroll}>
        {papers.map((p) => (
          <div key={p.title} className={styles.scienceCard}>
            <div className={styles.scienceMeta}>{p.meta}</div>
            <div className={styles.scienceTitle}>{p.title}</div>
            <div className={styles.scienceFinding}>{p.finding}</div>
          </div>
        ))}
      </div>
      <div className={styles.scienceDots}>
        {papers.map((_, i) => (
          <span
            key={i}
            className={`${styles.scienceDot} ${i === active ? styles.scienceDotActive : ""}`}
          />
        ))}
      </div>
    </div>
  );
}

function TreatmentDetails() {
  const { answers } = useFlow();
  const [open, setOpen] = useState<number | null>(null);
  const isFemale = answers.gender === "female";

  // Items 1-4 are shared. Item 5 varies by gender (DHT blocker for men /
  // "Does this work for women?" for women). Item 6 (refund) is shared.
  const items = useMemo<Array<{ q: string; a: React.ReactNode }>>(() => {
    const shared = [
      {
        q: "What do I have to do?",
        a: isFemale
          ? "Think of it like a daily ritual for your scalp. 15-20 minutes of guided scalp massages every day. Six techniques rotated through the week — done with your hands, no products or devices required. The app walks you through each session: open it, follow along, mark complete."
          : "Think of it like a workout for your hair. 15-20 minutes of guided scalp exercises every day. Six techniques rotated through the week — done with your hands, no products or devices required. The app walks you through each session: open it, follow along, mark complete.",
      },
      {
        q: "Will this work for my hair loss?",
        a: "KESHAH is built for androgenic alopecia, also known as genetic hair loss or hair loss due to stress. It's not designed for alopecia areata, scarring alopecia, or hair loss from chemotherapy or thyroid issues.",
      },
      {
        q: "Will this regrow new hair?",
        a: isFemale
          ? "The scalp massages generally stop hair loss and help you keep what you have. For growing new hair, we offer a microneedling kit available only to our members — you can add it on at any time inside the app."
          : "The scalp exercises generally stop hair loss and help you keep what you have. For growing new hair, we offer a microneedling kit available only to our members — you can add it on at any time inside the app.",
      },
      {
        q: "How is this different from minoxidil?",
        a: "Minoxidil widens blood vessels chemically. KESHAH does the same thing physically — by releasing the scalp tension that's constricting them. Both work on increasing blood flow.",
      },
      {
        q: "The science",
        a: <ScienceCarousel isFemale={isFemale} />,
      },
    ];

    const genderQuestion = isFemale
      ? {
          q: "Does this work for women of all hair types?",
          a: "Yes — women of all hair types have seen results with consistency. The most important thing is to show up for your daily practice!",
        }
      : {
          q: "Does this work without a DHT blocker?",
          a: "Yes. Most members — including many in the results screenshots — saw their results with KESHAH alone. No DHT blocker needed. If you'd prefer to add a DHT blocker later, you can, but it's not required.",
        };

    return [...shared, genderQuestion];
  }, [isFemale]);

  return (
    <div className={styles.detailsCard}>
      {items.map((item, i) => (
        <div key={item.q} className={styles.detailsItem}>
          <button
            type="button"
            className={styles.detailsHead}
            onClick={() => {
              lightHaptic();
              setOpen(open === i ? null : i);
            }}
          >
            <span>{item.q}</span>
            <ChevronIcon open={open === i} />
          </button>
          {open === i && (
            typeof item.a === "string"
              ? <div className={styles.detailsBody}>{item.a}</div>
              : item.a
          )}
        </div>
      ))}
    </div>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className={`${styles.detailsChevron} ${open ? styles.detailsChevronOpen : ""}`}
    >
      <path
        d="M3 5L7 9L11 5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// Timeline \u2014 mirrors the mobile trial paywall's 5-step, trial-anchored
// journey. The IF-YOU-CONTINUE-AFTER-DAY-7 divider sits between the
// in-trial beats (Today / Day 1-6 / Day 7) and the post-trial beats
// (Day 60-90 / Day 90+) so the free-trial mechanic reads as a stage of
// its own, not just another milestone.
type TimelineItem =
  | { kind: "milestone"; day: string; title: string; isFirst?: boolean; isLast?: boolean }
  | { kind: "divider"; label: string };

function Timeline() {
  const items: TimelineItem[] = [
    { kind: "milestone", day: "Today", title: "Full access unlocked. No payment.", isFirst: true },
    { kind: "milestone", day: "Day 1\u20136", title: "Scalp starts to loosen." },
    { kind: "milestone", day: "Day 7", title: "Plan starts. Cancel easily before then." },
    { kind: "divider", label: "IF YOU CONTINUE AFTER DAY 7" },
    { kind: "milestone", day: "Day 60\u201390", title: "Hair fall stops." },
    { kind: "milestone", day: "Day 90+", title: "Keep your results.", isLast: true },
  ];

  return (
    <div className={styles.timeline}>
      {items.map((item, i) => {
        if (item.kind === "divider") {
          return (
            <div
              key={`divider-${i}`}
              style={{
                display: "flex",
                alignItems: "stretch",
                minHeight: 0,
              }}
            >
              <div
                style={{
                  width: 20,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    width: 1,
                    background: "var(--fg-15)",
                  }}
                />
              </div>
              <div
                style={{
                  flex: 1,
                  paddingLeft: 14,
                  paddingTop: 4,
                  paddingBottom: 18,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 1.5,
                  color: "var(--text-30)",
                  alignSelf: "center",
                }}
              >
                {item.label}
              </div>
            </div>
          );
        }
        return (
          <div key={item.day} className={styles.milestone}>
            <div className={styles.dotColumn}>
              <div className={`${styles.dot} ${item.isFirst ? styles.dotFilled : ""}`} />
              {i < items.length - 1 && <div className={styles.dotLine} />}
            </div>
            <div className={styles.milestoneText}>
              <div className={styles.milestoneDay}>{item.day}</div>
              <div className={styles.milestoneTitle}>{item.title}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
