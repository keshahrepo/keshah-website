"use client";

// Mid-funnel results moment — Hers-style 3-customer card layout. Lands
// right after HairGoal (the user has just stated their outcomes) and
// before Commitment, so the proof primes the yes-I-can-do-this answer.
// Auto-skips on men's funnels (men have their own ResultScreenshots
// gallery later that handles the same job).

import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import HLSVideo from "../components/HLSVideo";
import styles from "../start.module.css";

interface CustomerCard {
  name: string;
  /** Thumbnail used as video poster (still frame before / while loading). */
  image: string;
  /** Optional HLS (.m3u8) stream — when present, plays as video on the card. */
  videoUrl?: string;
  outcome: string;
}

// Real customer testimonials sourced from the Flutter app's testimonial_videos
// data (lib/screens/auth/post_auth_flow_2/pages/testimonial_videos.dart).
// Three women picked to show a timeline progression: week 1 → week 2 → week 5,
// so the user sees expected pacing of results. Thumbnails are served from
// the same S3 bucket the app uses; if those URLs ever change, sync this list.
const CARDS: CustomerCard[] = [
  {
    name: "Shivani",
    image:
      "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/shivaniday07_thumb.jpg",
    videoUrl:
      "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/shivaniday07HLS.m3u8",
    outcome: "Day 7 — less shedding",
  },
  {
    name: "Yajaira",
    image:
      "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/Yajairaday14_thumb.jpg",
    videoUrl:
      "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/Yajairaday14HLS.m3u8",
    outcome: "Day 14 — hair fall reduced",
  },
  {
    name: "Zahira",
    image:
      "https://keshah-video.s3.ap-south-1.amazonaws.com/testimonials-stoppage/thumbnails/zahiraday28_thumb.jpg",
    videoUrl:
      "https://dosm2lichqd6n.cloudfront.net/testimonials-stoppage/stream/zahiraday28HLS.m3u8",
    outcome: "Day 28 — visible difference",
  },
];

export default function CustomerResults() {
  const { answers, next, back } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";

  useEffect(() => {
    if (!isWomen) next();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isWomen]);

  if (!isWomen) return null;

  const handleContinue = () => {
    mediumHaptic();
    next();
  };

  return (
    <div className={styles.stepBody}>
      <div
        className={styles.stepInner}
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 32px)",
          // Loosen the horizontal padding so the carousel can extend
          // edge-to-edge while the headline/subhead keep margin.
          paddingLeft: 0,
          paddingRight: 0,
        }}
      >
        <div style={{ padding: "0 24px" }}>
          <h1 className={styles.headline} style={{ fontSize: 26 }}>
            We can help you get there.
          </h1>
          <p
            style={{
              fontSize: 15,
              color: "var(--fg-55)",
              marginTop: 8,
              marginBottom: 20,
            }}
          >
            With daily scalp massages, you can start to see results in 60 to 90 days.
          </p>
        </div>

        {/* Horizontal swipeable carousel — 9:16 vertical cards with
            CSS scroll-snap. User flicks left/right to see each testimonial
            at full size. First card has 24px left padding to align with the
            page gutter; last card has 24px right padding so it can fully
            snap to view. */}
        <div
          style={{
            display: "flex",
            gap: 12,
            overflowX: "auto",
            scrollSnapType: "x mandatory",
            scrollPadding: "0 24px",
            WebkitOverflowScrolling: "touch",
            paddingLeft: 24,
            paddingRight: 24,
            paddingBottom: 8,
          }}
        >
          {CARDS.map((c) => (
            <div
              key={c.name}
              style={{
                flex: "0 0 auto",
                width: "min(75vw, 280px)",
                aspectRatio: "9 / 16",
                position: "relative",
                borderRadius: 18,
                overflow: "hidden",
                background: "var(--fg-4)",
                scrollSnapAlign: "center",
              }}
            >
              {c.videoUrl ? (
                <HLSVideo
                  src={c.videoUrl}
                  poster={c.image}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.image}
                  alt={c.name}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              )}
              {/* Bottom gradient + overlay text */}
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  padding: "60px 16px 16px",
                  background:
                    "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
                  color: "#fff",
                }}
              >
                <div
                  style={{
                    fontSize: 18,
                    fontWeight: 700,
                    marginBottom: 2,
                    textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                  }}
                >
                  {c.name}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    opacity: 0.95,
                    textShadow: "0 1px 2px rgba(0,0,0,0.5)",
                  }}
                >
                  {c.outcome}
                </div>
              </div>
            </div>
          ))}
        </div>

        <p
          style={{
            fontSize: 11,
            color: "var(--fg-40)",
            textAlign: "center",
            marginTop: 14,
            marginBottom: 0,
            lineHeight: 1.4,
            padding: "0 24px",
          }}
        >
          Individual results will vary. Customers shared their experience.
        </p>
      </div>

      <div className={styles.buttonRow}>
        <button
          type="button"
          className={styles.button}
          onClick={handleContinue}
        >
          Continue
        </button>
        <button
          type="button"
          onClick={back}
          style={{ display: "none" }}
          aria-hidden
        />
      </div>
    </div>
  );
}
