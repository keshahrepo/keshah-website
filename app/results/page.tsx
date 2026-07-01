// Public results / social-proof landing page. Dark editorial aesthetic
// matching /m and /women. Minimal chrome — no section subtitles, no
// guarantee copy, no fluff. Just: hero, scrolling video wall, scrolling
// regrowth wall, screenshots, CTA.

import type { Metadata } from "next";
import Image from "next/image";
import HLSVideo from "../start/components/HLSVideo";
import styles from "./results.module.css";

export const metadata: Metadata = {
  title: "Results — KESHAH",
  description:
    "Real people. Real results. See what happens when you fix scalp tension.",
  openGraph: {
    title: "Results — KESHAH",
    description: "Real people. Real results.",
    images: ["/start/story/after_hairline.jpg"],
  },
};

// 12 HLS testimonials — people talking. Source: KESHAH-Mobile-App
// /lib/screens/auth/post_auth_flow_2/pages/testimonial_videos.dart
const TESTIMONIALS = [
  { name: "Terrence",   day: 14, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/terrenceday14HLS.m3u8",   thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/terrenceday14_thumb.jpg" },
  { name: "Zahira",     day: 28, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/zahiraday28HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/zahiraday28_thumb.jpg" },
  { name: "Kartik",     day: 7,  video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream3/kartikday07HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kartikday07_thumb.jpg" },
  { name: "Shivani",    day: 7,  video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/shivaniday07HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/shivaniday07_thumb.jpg" },
  { name: "Bharat",     day: 14, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/Bharatday14HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/Bharatday14_thumb.jpg" },
  { name: "Yajaira",    day: 14, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/Yajairaday14HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/Yajairaday14_thumb.jpg" },
  { name: "Kalpana",    day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/kalpanaday21HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kalpanaday21_thumb.jpg" },
  { name: "King",       day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream3/kingday21HLS.m3u8",      thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kingday21_thumb.jpg" },
  { name: "Nisha",      day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/nishaday21HLS.m3u8",      thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/nishaday21_thumb.jpg" },
  { name: "Venkatesh",  day: 21, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/venkateshday21HLS.m3u8",  thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/venkateshday21_thumb.jpg" },
  { name: "Nestor",     day: 28, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/nestorday28HLS.m3u8",     thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/nestorday28_thumb.jpg" },
  { name: "Kwanele",    day: 35, video: "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/kwaneleday35HLS.m3u8",    thumb: "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/kwaneleday35_thumb.jpg" },
];

// 13 short-form transformation clips — visual before/after. Same set on /start.
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

// 8 long-form regrowth photos — 4+ month results. Copied from Flutter app.
const REGROWTH = [
  "/start/results/regrowth/regrowth_6.png",
  "/start/results/regrowth/regrowth_4.png",
  "/start/results/regrowth/regrowth_crown.png",
  "/start/results/regrowth/regrowth_3.png",
  "/start/results/regrowth/regrowth_7.png",
  "/start/results/regrowth/regrowth_2.png",
  "/start/results/regrowth/regrowth_1.png",
  "/start/results/regrowth/regrowth_5.png",
];

// 12 social proof screenshots — public source content already posted to
// TikTok / Reddit / iMessage / WhatsApp by members.
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

// Interleave testimonials + transformations so both styles appear
// throughout the scrolling row.
const VIDEOS: Array<
  | { key: string; kind: "t"; video: string; thumb: string; name: string; day: number }
  | { key: string; kind: "x"; src: string; poster: string }
> = (() => {
  const out: Array<
    | { key: string; kind: "t"; video: string; thumb: string; name: string; day: number }
    | { key: string; kind: "x"; src: string; poster: string }
  > = [];
  const max = Math.max(TESTIMONIALS.length, TRANSFORMATIONS.length);
  for (let i = 0; i < max; i++) {
    if (TESTIMONIALS[i]) {
      const t = TESTIMONIALS[i];
      out.push({ key: `t-${t.name}`, kind: "t", video: t.video, thumb: t.thumb, name: t.name, day: t.day });
    }
    if (TRANSFORMATIONS[i]) {
      const x = TRANSFORMATIONS[i];
      out.push({ key: `x-${i}`, kind: "x", src: x.src, poster: x.poster });
    }
  }
  return out;
})();

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
          <p className={styles.trustLine}>
            <span className={styles.stars}>★</span> 4.8
            <span className={styles.trustDot}>·</span>
            35,000+ members
          </p>

          {/* Aadi's before/after (self-consented) */}
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
                alt="Aadi's hairline after the KESHAH routine"
                width={480}
                height={480}
                className={styles.baImg}
              />
              <figcaption className={styles.baLabel}>Aadi · After</figcaption>
            </figure>
          </div>
        </div>
      </section>

      {/* ── Video row (marquee, both testimonials + transformations
             interleaved). Track duplicated for seamless loop; keyframe
             translates by -50% so second copy slides in as first exits.
             Height fixed at 380px so keyframe math is deterministic
             regardless of video load timing. Cards below get 210px width
             (9:16 of 373px → ~210x373) to stay portrait. */}
      <section className={styles.rowSection}>
        <div className={styles.rowWrap}>
          <div className={styles.track}>
            {[...VIDEOS, ...VIDEOS].map((v, idx) => (
              <div key={`${v.key}-${idx}`} className={styles.videoCard}>
                {v.kind === "t" ? (
                  <HLSVideo src={v.video} poster={v.thumb} className={styles.video} />
                ) : (
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
                  />
                )}
                {v.kind === "t" && (
                  <div className={styles.videoMeta}>
                    <span className={styles.videoName}>{v.name}</span>
                    <span className={styles.videoDay}>Day {v.day}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Regrowth row (marquee, reverse direction so it's
             visually distinct from the video row above). 8 photos ×2 for
             seamless loop. */}
      <section className={styles.rowSection}>
        <div className={styles.rowWrap}>
          <div className={`${styles.track} ${styles.trackReverse}`}>
            {[...REGROWTH, ...REGROWTH].map((src, i) => (
              <div key={`${src}-${i}`} className={styles.photoCard}>
                <Image
                  src={src}
                  alt="Member regrowth result"
                  width={800}
                  height={800}
                  className={styles.photoImg}
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Screenshots (static masonry, kept for text-based social proof
             that scrolling wouldn't showcase well — captions matter here) */}
      <section className={styles.section}>
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

      {/* ── CTA (App Store + Play Store badges, matches /m and /women) ── */}
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
