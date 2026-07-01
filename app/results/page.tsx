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
      "Standardized Scalp Massage",
      "Neck Tension Release",
      "KESHAH Oils",
    ],
    duration: "14 months",
    photo: "/start/results/regrowth/regrowth_crown.png",
    photoAlt: "Najinthan's crown regrowth after 14 months on the KESHAH routine",
    paragraphs: [
      "Najinthan had years of progressive crown thinning. Before KESHAH he tried high-dose Omega-3 and biotin supplements — money wasted, no results. He wanted a natural approach that addressed the root cause, not another drug.",
      "He started the routine in April 2025. Daily 20-45 minute sessions, no missed days. No drugs, no minoxidil, no finasteride — just the mechanical protocol.",
      "14 months in, he's still consistent. Density has visibly returned in previously thinning areas.",
    ],
    quote:
      "If I never started KESHAH, I'd have been almost bald by now. It's made a huge difference in my life and given me a lot of confidence.",
  },
  {
    name: "Arush",
    location: "Bay Area, USA / India",
    hairLossType: "Androgenic Alopecia — Diffuse Thinning",
    regimen: [
      "Standardized Scalp Massage",
      "Microneedling (0.7mm → 2mm depth)",
      "KESHAH Oils",
    ],
    duration: "6+ months documented",
    photo: "/start/results/regrowth/regrowth_6.png",
    photoAlt: "Arush's hair regrowth after the KESHAH microneedling protocol",
    paragraphs: [
      "Arush came to KESHAH with a scientist's skepticism. He knew the DHT-blocker landscape from his pharmaceutical background — and he specifically wanted a route that didn't touch that pathway. No finasteride, no minoxidil, no side-effect gamble.",
      "He runs the advanced KESHAH protocol: dry massages plus microneedling. Biweekly at 0.7mm depth to start, working up to weekly at 2mm depth.",
      "Every two months he documents visible density gains. His hair fall grinds to a halt when he stays consistent.",
    ],
    quote:
      "Day to day hairfall basically grinds to a halt when I microneedle more. I had great growth even without DHT blockers.",
  },
  {
    name: "Théo",
    location: "Paris, France",
    hairLossType: "Androgenic Alopecia — Early Stage",
    regimen: [
      "Standardized Scalp Massage",
      "Microneedling (Weekly)",
      "KESHAH Oils",
    ],
    duration: "5 months",
    photo: "/start/results/regrowth/regrowth_4.png",
    photoAlt: "Théo's hair progression on the KESHAH routine",
    paragraphs: [
      "Théo started with the free KESHAH stoppage routine — daily scalp massages, no drugs. A few months in, his scalp had loosened and his hair fall had stopped.",
      "But he wanted more than stopping. He wanted regrowth. He upgraded to the KESHAH regrowth kit: microneedling once a week, plus the oils and daily massages.",
      "Still in progress — hair fall has stopped, regrowth is starting. He's the customer story most people are living through right now.",
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

      {/* ── How this started (Aadi's brief story) ── */}
      <section className={styles.founderSection}>
        <div className={styles.founderInner}>
          <p className={styles.eyebrow}>How this started</p>
          <h2 className={styles.h2}>The founder&rsquo;s own journey</h2>
          <div className={styles.founderBeforeAfter}>
            <figure className={styles.founderFig}>
              <Image
                src="/start/story/before_hairline.jpg"
                alt="Aadi's hairline before"
                width={480}
                height={480}
                className={styles.founderImg}
              />
              <figcaption className={styles.founderLabel}>Before</figcaption>
            </figure>
            <figure className={styles.founderFig}>
              <Image
                src="/start/story/after_hairline.jpg"
                alt="Aadi's hairline after"
                width={480}
                height={480}
                className={styles.founderImg}
              />
              <figcaption className={styles.founderLabel}>After</figcaption>
            </figure>
          </div>
          <p className={styles.founderText}>
            KESHAH started with Aadi&rsquo;s own hair loss journey. After a
            dermatologist told him he&rsquo;d be bald in two years without
            finasteride, he refused. He spent the next four years figuring out
            an alternative — scalp tension and blood flow — and built KESHAH
            so others could follow the same protocol.
          </p>
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
