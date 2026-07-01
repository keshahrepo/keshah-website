// Public results / social-proof landing page. Built to answer the "where
// are the photos?" objection that dominates the Reddit thread ranking #1
// for "keshah reviews". Content assembled from the existing consented
// assets already displayed in the /start flow + the app's testimonial
// videos. No user photos beyond what already has explicit public consent.
//
// UI mirrors the app aesthetic (dark cream palette, Poppins, rounded
// cards) using shared start.module.css helpers where possible.

import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import HLSVideo from "../start/components/HLSVideo";
import styles from "./results.module.css";

export const metadata: Metadata = {
  title: "Real results — KESHAH",
  description:
    "Real people, real results. See what happens when you fix scalp tension. No drugs, no minoxidil, no finasteride.",
  openGraph: {
    title: "Real results — KESHAH",
    description:
      "Real people, real results. See what happens when you fix scalp tension.",
    images: ["/start/story/after_hairline.jpg"],
  },
};

// 12 curated testimonial videos — same set already shown to every user in
// the app's PostAuthFlow2 onboarding + on /start for women. HLS streams
// live on the shared CloudFront (dosm2lichqd6n.cloudfront.net) with
// thumbnails on S3 (keshah-video.s3.ap-south-1.amazonaws.com). Source of
// truth: KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/testimonial_videos.dart
const TESTIMONIALS = [
  { name: "Terrence",   day: 14, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/terrenceday14HLS.m3u8",   thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/terrenceday14_thumb.jpg" },
  { name: "Zahira",     day: 28, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/zahiraday28HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/zahiraday28_thumb.jpg" },
  { name: "Kartik",     day: 7,  video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream3/kartikday07HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kartikday07_thumb.jpg" },
  { name: "Shivani",    day: 7,  video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/shivaniday07HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/shivaniday07_thumb.jpg" },
  { name: "Bharat",     day: 14, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/Bharatday14HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/Bharatday14_thumb.jpg" },
  { name: "Yajaira",    day: 14, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/Yajairaday14HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/Yajairaday14_thumb.jpg" },
  { name: "Kalpana",    day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/kalpanaday21HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kalpanaday21_thumb.jpg" },
  { name: "King",       day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream3/kingday21HLS.m3u8",       thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kingday21_thumb.jpg" },
  { name: "Nisha",      day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/nishaday21HLS.m3u8",      thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/nishaday21_thumb.jpg" },
  { name: "Venkatesh",  day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/venkateshday21HLS.m3u8",  thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/venkateshday21_thumb.jpg" },
  { name: "Nestor",     day: 28, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/nestorday28HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/nestorday28_thumb.jpg" },
  { name: "Kwanele",    day: 35, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/kwaneleday35HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kwaneleday35_thumb.jpg" },
];

// 13 transformation clips — 7 male + 6 female. Same content shown on
// /start ResultScreenshots step. Poster frames extracted at ~70% of each
// clip so the "after" state is what the user sees before playback.
const TRANSFORMATIONS = [
  { src: "/start/results/proof_clip_1.mp4", poster: "/start/results/proof_clip_1_poster.jpg" },
  { src: "/start/results/proof_clip_2.mp4", poster: "/start/results/proof_clip_2_poster.jpg" },
  { src: "/start/results/proof_clip_3.mp4", poster: "/start/results/proof_clip_3_poster.jpg" },
  { src: "/start/results/proof_clip_4.mp4", poster: "/start/results/proof_clip_4_poster.jpg" },
  { src: "/start/results/proof_clip_5.mp4", poster: "/start/results/proof_clip_5_poster.jpg" },
  { src: "/start/results/proof_clip_6.mp4", poster: "/start/results/proof_clip_6_poster.jpg" },
  { src: "/start/results/proof_clip_7.mp4", poster: "/start/results/proof_clip_7_poster.jpg" },
  { src: "/start/results/women_clip_1.mp4", poster: "/start/results/women_clip_1_poster.jpg" },
  { src: "/start/results/women_clip_2.mp4", poster: "/start/results/women_clip_2_poster.jpg" },
  { src: "/start/results/women_clip_3.mp4", poster: "/start/results/women_clip_3_poster.jpg" },
  { src: "/start/results/women_clip_4.mp4", poster: "/start/results/women_clip_4_poster.jpg" },
  { src: "/start/results/women_clip_5.mp4", poster: "/start/results/women_clip_5_poster.jpg" },
  { src: "/start/results/women_clip_6.mp4", poster: "/start/results/women_clip_6_poster.jpg" },
];

// 8 regrowth before/afters — 4-6 month treatment users. Same set shown in
// the app's regrowth_plan_summary.dart. Copied to public/start/results/regrowth/.
const REGROWTH = [
  { name: "Arush",     img: "/start/results/regrowth/regrowth_6.png" },
  { name: "Joseph",    img: "/start/results/regrowth/regrowth_4.png" },
  { name: "Najinthan", img: "/start/results/regrowth/regrowth_crown.png" },
  { name: "Collin",    img: "/start/results/regrowth/regrowth_3.png" },
  { name: "Bayal",     img: "/start/results/regrowth/regrowth_7.png" },
  { name: "Vinnie",    img: "/start/results/regrowth/regrowth_2.png" },
  { name: "Jonathon",  img: "/start/results/regrowth/regrowth_1.png" },
  { name: "Member",    img: "/start/results/regrowth/regrowth_5.png" },
];

// 12 social proof screenshots — TikTok / Reddit / iMessage / WhatsApp
// captures of users describing their results. Already public source
// content (posted publicly on those platforms originally). Trimmed from
// 15 to 12 for a cleaner 3-column masonry (was overflowing on desktop).
const SCREENSHOTS = [
  "/start/results/proof_tiktok_finasteride_vs_keshah.jpeg",
  "/start/results/proof_reddit_5_month.jpeg",
  "/start/results/proof_tiktok_growing_back.jpeg",
  "/start/results/proof_tiktok_tension_reduced.jpeg",
  "/start/results/proof_reddit_105_days.jpeg",
  "/start/results/proof_tiktok_3_months.jpeg",
  "/start/results/proof_whatsapp_hairline.jpeg",
  "/start/results/proof_tiktok_stops_hair_loss.jpeg",
  "/start/results/proof_reddit_worth_every_penny.jpeg",
  "/start/results/proof_imessage_grateful.jpeg",
  "/start/results/proof_whatsapp_one_year.jpeg",
  "/start/results/proof_women_zukie.jpeg",
];

export default function ResultsPage() {
  return (
    <main className={styles.root}>
      {/* ── Hero ── */}
      <section className={styles.hero}>
        <div className={styles.heroInner}>
          <p className={styles.eyebrow}>Real people · Real results</p>
          <h1 className={styles.headline}>
            Stop your hair loss.<br />No drugs.
          </h1>
          <p className={styles.subhead}>
            Every photo, video, and story on this page is a real member
            of KESHAH.
          </p>
          <p className={styles.trustLine}>
            <span className={styles.stars}>★</span> 4.8
            <span className={styles.trustDot}>·</span>
            35,000+ members
            <span className={styles.trustDot}>·</span>
            60-day guarantee
          </p>

          {/* Aadi's before/after — self-consented (founder). */}
          <div className={styles.beforeAfter}>
            <figure className={styles.baFig}>
              <Image
                src="/start/story/before_hairline.jpg"
                alt="Aadi's hairline before starting KESHAH"
                width={480}
                height={480}
                className={styles.baImg}
              />
              <figcaption className={styles.baLabel}>Aadi · Before</figcaption>
            </figure>
            <figure className={styles.baFig}>
              <Image
                src="/start/story/after_hairline.jpg"
                alt="Aadi's hairline after 60+ days of the KESHAH routine"
                width={480}
                height={480}
                className={styles.baImg}
              />
              <figcaption className={styles.baLabel}>Aadi · After</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── Video testimonials ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.h2}>Members share their results</h2>
          <p className={styles.subhead}>
            Real videos from KESHAH members. Days 7–35 of the routine.
          </p>
        </div>
        <div className={styles.videoGrid}>
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className={styles.videoCard}>
              <HLSVideo
                src={t.video}
                poster={t.thumb}
                className={styles.video}
              />
              <div className={styles.videoMeta}>
                <span className={styles.videoName}>{t.name}</span>
                <span className={styles.videoDay}>Day {t.day}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Transformations ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.h2}>Before &amp; after transformations</h2>
          <p className={styles.subhead}>
            Members who stuck with the routine for 60–120+ days.
          </p>
        </div>
        <div className={styles.videoGrid}>
          {TRANSFORMATIONS.map((v, i) => (
            <div key={v.src} className={styles.videoCard}>
              <video
                src={v.src}
                poster={v.poster}
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                disablePictureInPicture
                className={styles.video}
                aria-label={`Transformation ${i + 1}`}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Regrowth (long-term users) ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.h2}>Regrowth after 4+ months</h2>
          <p className={styles.subhead}>
            Members on the full regrowth treatment. Results at 120+ days.
          </p>
        </div>
        <div className={styles.regrowthGrid}>
          {REGROWTH.map((r) => (
            <figure key={r.name} className={styles.regrowthCard}>
              <Image
                src={r.img}
                alt={`${r.name}'s hair regrowth results after the KESHAH treatment`}
                width={800}
                height={800}
                className={styles.regrowthImg}
              />
              <figcaption className={styles.regrowthName}>{r.name}</figcaption>
            </figure>
          ))}
        </div>
      </section>

      {/* ── Screenshots ── */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.h2}>What people are saying</h2>
          <p className={styles.subhead}>
            Real posts from TikTok, Reddit, iMessage, and WhatsApp — shared
            publicly by KESHAH members.
          </p>
        </div>
        <div className={styles.screenshotGrid}>
          {SCREENSHOTS.map((src, i) => (
            <div key={src} className={styles.screenshotCard}>
              <Image
                src={src}
                alt={`Member testimonial ${i + 1}`}
                width={600}
                height={800}
                className={styles.screenshot}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Guarantee ── */}
      <section className={styles.section}>
        <div className={styles.guaranteeCard}>
          <div className={styles.guaranteeInner}>
            <Image
              src="/images/aadi.png"
              alt="Aadi, KESHAH founder"
              width={80}
              height={80}
              className={styles.guaranteeAvatar}
            />
            <div>
              <p className={styles.guaranteeQuote}>
                "Complete 60 days in the app. If your hair fall doesn't stop,
                message me and I'll personally make sure you get a refund."
              </p>
              <p className={styles.guaranteeName}>— Aadi, KESHAH Founder</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className={styles.cta}>
        <div className={styles.ctaInner}>
          <h2 className={styles.ctaHeadline}>Try the routine free</h2>
          <p className={styles.ctaSubhead}>
            Start the 60-day stoppage treatment. No credit card.
          </p>
          <div className={styles.ctaButtons}>
            <Link href="/start" className={styles.btnPrimary}>
              Start free →
            </Link>
            <a
              href="https://www.tiktok.com/@aadi.keshah"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.btnSecondary}
            >
              Follow @aadi.keshah on TikTok
            </a>
          </div>
          <p className={styles.ctaFinePrint}>
            Individual results vary. Consistency + time = results.
          </p>
        </div>
      </section>
    </main>
  );
}
