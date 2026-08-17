"use client";

// Auto-scrolling photo rows with "join X members" overlay.
// Switched from MP4 to static poster frames extracted at ~70% of each clip
// (the "after" usually lands then). Reason: 13 doubled-source <video>
// elements all autoplaying blew past mobile Safari's concurrent-decoder
// cap (~3-4) and competed with the CSS scroll animation. Posters are
// ~600 KB total vs ~10 MB of video, paint instantly, and the scroll
// behaves identically — viewers never watched the clips here anyway,
// they registered motion-blur proof through the gradient overlay.
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig, practiceTerm } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import styles from "./social-proof.module.css";

// Gender-pure rows: men never see women's clips, women never see men's.
// The old mixed ROW_1 / ROW_2 setup put female faces on a men's funnel
// and vice versa, which weakened the "this is for me" signal. Each
// gender now gets a single full-height scrolling row.
const MEN_ROW = [
  "/start/results/proof_clip_1_poster.jpg",
  "/start/results/proof_clip_2_poster.jpg",
  "/start/results/proof_clip_3_poster.jpg",
  "/start/results/proof_clip_4_poster.jpg",
  "/start/results/proof_clip_5_poster.jpg",
  "/start/results/proof_clip_6_poster.jpg",
  "/start/results/proof_clip_7_poster.jpg",
];

const WOMEN_ROW = [
  "/start/results/women_clip_1_poster.jpg",
  "/start/results/women_clip_2_poster.jpg",
  "/start/results/women_clip_3_poster.jpg",
  "/start/results/women_clip_4_poster.jpg",
  "/start/results/women_clip_5_poster.jpg",
  "/start/results/women_clip_6_poster.jpg",
];

export default function SocialProof() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  const term = practiceTerm(config.audience, answers.gender);
  const isLight = config.theme === "light";
  const isWomen = config.audience === "women" || answers.gender === "female";

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  // Light-theme overrides — re-defines the CSS variables the .module.css
  // consumes so every text/background colour flips to cream palette without
  // duplicating styles. Also fixes the gradient (it hardcodes black in
  // CSS; we replace it with a cream gradient inline below).
  const rootStyle: React.CSSProperties | undefined = isLight
    ? ({
        ["--bg" as string]: "#FAF7F2",
        ["--text" as string]: "#1A1A1A",
        ["--text-50" as string]: "rgba(26,26,26,0.55)",
        ["--text-40" as string]: "rgba(26,26,26,0.4)",
        ["--fg-6" as string]: "rgba(26,26,26,0.06)",
      } as React.CSSProperties)
    : undefined;

  const gradientStyle: React.CSSProperties | undefined = isLight
    ? {
        background:
          "linear-gradient(to bottom, transparent 0%, transparent 40%, rgba(250,247,242,0.4) 50%, rgba(250,247,242,0.9) 60%, #FAF7F2 70%)",
      }
    : undefined;

  return (
    <div className={styles.root} style={rootStyle}>
      {/* GIF rows background — gender-pure single row for each audience */}
      <div className={styles.gifWrap}>
        <ScrollingRow
          gifs={isWomen ? WOMEN_ROW : MEN_ROW}
          duration={50}
          reverse={false}
          fullHeight
        />
      </div>

      {/* Gradient overlay for readability — cream variant on light theme so
          the black-to-bg fade in the CSS doesn't render a black band on the
          women's cream funnel. */}
      <div className={styles.gradient} style={gradientStyle} />

      {/* Foreground content */}
      <div className={styles.content}>
        <div className={styles.bigNumber}>{isWomen ? "8,538+" : "26,538+"}</div>
        <p className={styles.tagline}>{
          isWomen
            ? "women are reversing their hair thinning with KESHAH scalp massages"
            : `people are reversing their hair loss with KESHAH ${term}`
        }</p>

        <div className={styles.starsRow}>
          <span className={styles.stars}>★★★★★</span>
          <span className={styles.starsLabel}>4.8 on the App Store</span>
        </div>

        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}

interface ScrollingRowProps {
  gifs: string[];
  duration: number;
  reverse: boolean;
  /** When true, the row takes the full height of its container instead
   *  of the default 50% (used for the single-row women's variant so the
   *  posters render at full size). */
  fullHeight?: boolean;
}

function ScrollingRow({ gifs, duration, reverse, fullHeight }: ScrollingRowProps) {
  // Duplicate the list so the loop is seamless — when the first copy
  // translates off the left, the second copy is already in position.
  const doubled = [...gifs, ...gifs];

  return (
    <div className={styles.row} style={fullHeight ? { height: "100%" } : undefined}>
      <div
        className={`${styles.track} ${reverse ? styles.trackReverse : ""}`}
        style={{ animationDuration: `${duration}s` }}
      >
        {doubled.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${src}-${i}`}
            src={src}
            alt=""
            className={styles.gif}
            loading="lazy"
            decoding="async"
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}
