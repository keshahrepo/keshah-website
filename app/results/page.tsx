// Public results / social-proof page. Dark editorial aesthetic matching
// /m and /women. Case-study-first structure (Hims/Ro pattern) — deep
// individual member stories lead the page, then supporting proof
// (videos, before/afters, screenshots). Aadi's own before/after moved
// to a supporting section near the CTA so member results carry
// the credibility.
//
// Consent notes:
// - Najinthan: explicit yes (WhatsApp 11/30/25). Wants no face shown.
// - Arush: pro-brand friend, promotes KESHAH publicly. Confirm before
//   sharing the URL widely.
// - Théo: consented to public IG reviews. Confirm before sharing the URL widely.

import type { Metadata } from "next";
import Image from "next/image";
import styles from "./results.module.css";

export const metadata: Metadata = {
  title: "Results — KESHAH",
  description:
    "Real members. Real results. See what happens when you fix scalp tension.",
  openGraph: {
    title: "Results — KESHAH",
    description: "Real members. Real results.",
    images: ["/start/results/regrowth/regrowth_crown.png"],
  },
};

// ── Case studies ─────────────────────────────────────────────────────
// Each case study is an editorial block: big photo, backstory paragraphs,
// pull quote. Written from real WhatsApp conversations (not synthesized),
// which is why they read like reporting rather than marketing.

// Editorial case studies (Perfect Hair Health + Hims pattern). Each entry
// has structured metadata that renders as a data-driven "attribute footer"
// beneath the story — reads like reporting, not a landing page.

type CaseStudy = {
  name: string;
  location: string;                 // "Markham, Ontario, Canada"
  hairLossType: string;             // e.g. "Androgenic Alopecia — Crown Thinning"
  regimen: string[];                // list of protocol components
  duration: string;                 // "14 months"
  photo: string;
  photoAlt: string;
  paragraphs: string[];
  quote: string;
};

const CASE_STUDIES: CaseStudy[] = [
  {
    name: "Najinthan",
    location: "Markham, Ontario, Canada",
    hairLossType: "Androgenic Alopecia — Crown Thinning",
    regimen: [
      "KESHAH Mechanotherapy (Scalp + Neck)",
      "Regrowth Microneedling (Added Sept 2025)",
      "KESHAH Oils",
    ],
    duration: "14 months",
    photo: "/start/results/regrowth/regrowth_crown.png",
    photoAlt: "Najinthan's crown regrowth after 14 months on the KESHAH routine",
    paragraphs: [
      "Najinthan had noticed his crown thinning for years. He had tried high-dose Omega-3 and biotin supplements without any change to his hair. He wasn't willing to take finasteride or minoxidil.",
      "He started the KESHAH routine in April 2025 with scalp and neck mechanotherapy — 20 to 45 minutes per day. In September 2025 he added regrowth microneedling to the protocol.",
      "Fourteen months in, his hair fall has stopped and density has returned to previously thinning areas.",
    ],
    quote:
      "If I never started KESHAH, I'd have been almost bald by now. It's made a huge difference in my life and given me a lot of confidence.",
  },
  {
    name: "Arush",
    location: "Bay Area, USA / India",
    hairLossType: "Androgenic Alopecia — Diffuse Thinning",
    regimen: [
      "KESHAH Mechanotherapy (Scalp + Neck)",
      "Microneedling (0.7mm → 2mm depth)",
      "KESHAH Oils",
    ],
    duration: "6+ months documented",
    photo: "/start/results/regrowth/regrowth_6.png",
    photoAlt: "Arush's hair regrowth after the KESHAH microneedling protocol",
    paragraphs: [
      "Arush came to KESHAH with a pharmaceutical background and specific concerns about DHT-blocker side effects. He wanted a route that didn't rely on finasteride or minoxidil.",
      "He started the KESHAH regrowth protocol — daily mechanotherapy plus microneedling. Biweekly at 0.7mm depth to start, progressing to weekly at 2mm.",
      "He has documented visible density gains at every two-month check-in.",
    ],
    quote:
      "Day to day hairfall basically grinds to a halt when I microneedle more. I had great growth even without DHT blockers.",
  },
  {
    name: "Théo",
    location: "Paris, France",
    hairLossType: "Androgenic Alopecia — Early Stage",
    regimen: [
      "KESHAH Mechanotherapy (Scalp + Neck)",
      "Microneedling (Weekly)",
      "KESHAH Oils",
    ],
    duration: "5 months",
    photo: "/start/results/regrowth/theo/theo_composite.jpg",
    photoAlt: "Théo — Day 1 (14 Dec) and Day 165 (27 May) on the KESHAH routine",
    paragraphs: [
      "Théo started with the KESHAH stoppage routine — daily mechanotherapy, no drugs. A few months in, his scalp had loosened and his hair fall had stopped.",
      "He then upgraded to the regrowth kit, adding weekly microneedling to the protocol.",
      "Five months in, hair fall has stopped and regrowth is beginning to fill in the hairline.",
    ],
    quote: "My scalp is more flexible. I don't see hair loss anymore.",
  },
];

// ── Video testimonials ─────────────────────────────────────────────
// Using the captioned transformation MP4s (proof_clip_X + women_clip_X)
// instead of the HLS testimonial streams. Why: page videos autoplay
// MUTED, so audio-only testimonials (the HLS set) can't communicate.
// The proof_clip / women_clip MP4s have burned-in captions + before/
// after overlays baked into the video — designed for silent viewing.
// Same set already lives on /start SocialProof + ResultScreenshots.
const TESTIMONIALS = [
  { src: "/start/results/proof_clip_1.mp4",  poster: "/start/results/proof_clip_1_poster.jpg" },
  { src: "/start/results/women_clip_1.mp4",  poster: "/start/results/women_clip_1_poster.jpg" },
  { src: "/start/results/proof_clip_2.mp4",  poster: "/start/results/proof_clip_2_poster.jpg" },
  { src: "/start/results/women_clip_2.mp4",  poster: "/start/results/women_clip_2_poster.jpg" },
  { src: "/start/results/proof_clip_3.mp4",  poster: "/start/results/proof_clip_3_poster.jpg" },
  { src: "/start/results/women_clip_3.mp4",  poster: "/start/results/women_clip_3_poster.jpg" },
  { src: "/start/results/proof_clip_4.mp4",  poster: "/start/results/proof_clip_4_poster.jpg" },
  { src: "/start/results/women_clip_4.mp4",  poster: "/start/results/women_clip_4_poster.jpg" },
  { src: "/start/results/proof_clip_5.mp4",  poster: "/start/results/proof_clip_5_poster.jpg" },
  { src: "/start/results/women_clip_5.mp4",  poster: "/start/results/women_clip_5_poster.jpg" },
  { src: "/start/results/proof_clip_6.mp4",  poster: "/start/results/proof_clip_6_poster.jpg" },
  { src: "/start/results/women_clip_6.mp4",  poster: "/start/results/women_clip_6_poster.jpg" },
  { src: "/start/results/proof_clip_7.mp4",  poster: "/start/results/proof_clip_7_poster.jpg" },
];

// Note: Removed the standalone "Before & after" grid and "From the
// community" screenshots section. The video testimonials already have
// before/after visual overlays baked into them (see proof_clip_X and
// women_clip_X — verified via frame extraction), so the static grid was
// duplicating that content. Screenshots didn't match the editorial tone.
// Final page = hero + 3 case studies + captioned videos + founder note + CTA.

export default function ResultsPage() {
  return (
    <main className={styles.root}>
      {/* ── Hero (editorial, not marketing) ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>KESHAH Case Studies</p>
          <h1 className={styles.headline}>
            Real Results from<br />KESHAH Members
          </h1>
          <p className={styles.heroLead}>
            Three members share their journey with the KESHAH routine — the
            protocol, the timeline, and what actually happened.
          </p>
          <p className={styles.heroByline}>
            Written by the KESHAH Editorial Team · Updated July 2026
          </p>
        </div>
      </section>

      {/* ── Case studies (editorial + structured metadata footer) ──
         Perfect Hair Health pattern: quote-driven narrative, then a
         data-block with hair loss type + regimen + duration. Reads
         like a journal case report rather than a testimonial card. */}
      {CASE_STUDIES.map((cs, i) => (
        <section key={cs.name} className={styles.caseSection}>
          <article className={styles.caseInner}>
            <div className={styles.caseNumber}>Case 0{i + 1}</div>
            <h2 className={styles.caseName}>{cs.name}</h2>
            <p className={styles.caseSubtitle}>
              {cs.location} · {cs.duration} on the routine
            </p>

            <div className={styles.casePhotoWrap}>
              <Image
                src={cs.photo}
                alt={cs.photoAlt}
                width={1200}
                height={800}
                sizes="(min-width: 960px) 720px, 100vw"
                className={styles.casePhoto}
                priority={i === 0}
              />
            </div>

            <div className={styles.caseBody}>
              {cs.paragraphs.map((p, idx) => (
                <p key={idx} className={styles.caseParagraph}>{p}</p>
              ))}
            </div>

            <blockquote className={styles.caseQuote}>
              &ldquo;{cs.quote}&rdquo;
              <cite className={styles.caseQuoteCite}>
                — {cs.name}, {cs.location}
              </cite>
            </blockquote>

            {/* Structured metadata footer — Perfect Hair Health pattern.
                Positions the case as reported data, not a testimonial. */}
            <dl className={styles.caseMeta}>
              <div className={styles.caseMetaRow}>
                <dt className={styles.caseMetaLabel}>Hair Loss Type</dt>
                <dd className={styles.caseMetaValue}>{cs.hairLossType}</dd>
              </div>
              <div className={styles.caseMetaRow}>
                <dt className={styles.caseMetaLabel}>Regimen</dt>
                <dd className={styles.caseMetaValue}>
                  {cs.regimen.map((r, idx) => (
                    <span key={r} className={styles.caseRegimenItem}>
                      {r}
                      {idx < cs.regimen.length - 1 && <br />}
                    </span>
                  ))}
                </dd>
              </div>
              <div className={styles.caseMetaRow}>
                <dt className={styles.caseMetaLabel}>Duration</dt>
                <dd className={styles.caseMetaValue}>{cs.duration}</dd>
              </div>
            </dl>
          </article>
        </section>
      ))}

      {/* ── Video testimonials (static grid, no marquee) ──
         Captioned MP4s (burned-in subtitles + before/after overlays)
         so they communicate silently in the muted autoplay context. */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <p className={styles.eyebrow}>More members</p>
          <h2 className={styles.h2}>Hear from members</h2>
        </div>
        <div className={styles.videoGrid}>
          {TESTIMONIALS.map((t, i) => (
            <div key={t.src} className={styles.videoCard}>
              <video
                src={t.src}
                poster={t.poster}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                disablePictureInPicture
                className={styles.video}
                aria-label={`Member testimonial ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA (App Store + Play Store badges — matches /m and /women) ── */}
      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaHeadline}>Try the routine free</h2>
          <div className={styles.storeButtons}>
            <a
              href="https://apps.apple.com/app/id6450676544"
              className={styles.storeBadge}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/images/app-store-white.svg"
                alt="Download on the App Store"
                width={145}
                height={48}
                unoptimized
              />
            </a>
            <a
              href="https://play.google.com/store/apps/details?id=com.keshahapp.hair"
              className={styles.storeBadge}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Image
                src="/images/google-play.svg"
                alt="Get it on Google Play"
                width={145}
                height={48}
                unoptimized
              />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
