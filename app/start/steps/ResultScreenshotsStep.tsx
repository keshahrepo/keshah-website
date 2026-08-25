"use client";

/**
 * ResultScreenshotsStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/result_screenshots.dart
 *
 * Full-screen tap-through gallery of gender-pure result GIFs + cropped
 * testimonial screenshots (Reddit / TikTok / WhatsApp / iMessage).
 *
 * Behavior mirrors mobile:
 *   - Progress bar segments = totalSlides across the top.
 *   - Tap anywhere to advance. On the last slide, calls onComplete (next).
 *   - Back button (top-left) appears once currentIndex > 0.
 *   - GIFs fill the entire screen (BoxFit.cover). Screenshots render inside
 *     the "safe area" with 20px horizontal padding + 12px rounded corners
 *     (BoxFit.contain).
 *   - Content fades in per slide (500ms controller; fade 0.0-0.7 easeOut).
 *   - Gender-pure filtering: female uses women_clip_* + proof_women_zukie
 *     first + male-coded screenshots excluded. Male uses men clips + female-
 *     coded screenshots excluded.
 *
 * Web-specific deltas:
 *   - No Firestore write. On mobile the page writes
 *     `results_screenshots_started_at` under the user's Users/{id} doc, but
 *     at this point in the web funnel we don't yet have a Firebase UID
 *     (sign-up happens after paywall), so there's nothing to write against.
 *     Web-side funnel viewership is already captured by /api/funnel/track
 *     in flow-context.
 *   - Slide-in of the Flutter version's SlideTransition offset is minor
 *     enough (6% of height, easeOutCubic) that we render only the fade to
 *     avoid a distracting jitter on browser layout. Noted in fidelityNotes.
 */

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useFlow } from "../lib/flow-context";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { colors } from "../lib/tokens";

// GIF clips (full-screen, tap to advance). Order mirrors the Flutter source
// exactly — clip 7 intentionally precedes clip 6 because clip 6 (Venkatesh)
// lands strongest as the closer.
const MALE_GIF_CLIPS = [
  "/start/results/proof_clip_1.mp4", // Jonathon
  "/start/results/proof_clip_2.mp4", // Arush
  "/start/results/proof_clip_3.mp4", // Collin
  "/start/results/proof_clip_4.mp4",
  "/start/results/proof_clip_5.mp4",
  "/start/results/proof_clip_7.mp4",
  "/start/results/proof_clip_6.mp4", // Venkatesh
];

// All 6 women clips. Order matches the Flutter source (clip 5 + 1 + 4 first
// because those are the strongest visible transformations).
const FEMALE_GIF_CLIPS = [
  "/start/results/women_clip_5.mp4",
  "/start/results/women_clip_1.mp4",
  "/start/results/women_clip_4.mp4",
  "/start/results/women_clip_2.mp4",
  "/start/results/women_clip_3.mp4",
  "/start/results/women_clip_6.mp4",
];

// Cropped testimonial screenshots. Order mirrors the Flutter source.
const ALL_SCREENSHOTS = [
  "/start/results/proof_tiktok_finasteride_vs_keshah.jpeg",
  "/start/results/proof_tiktok_2_days_difference.jpeg",
  "/start/results/proof_tiktok_growing_back.jpeg",
  "/start/results/proof_reddit_30_days.jpeg",
  "/start/results/proof_tiktok_tension_reduced.jpeg",
  "/start/results/proof_reddit_105_days.jpeg",
  "/start/results/proof_tiktok_3_months.jpeg",
  "/start/results/proof_reddit_worth_every_penny.jpeg",
  "/start/results/proof_tiktok_it_works.jpeg",
  "/start/results/proof_tiktok_stops_hair_loss.jpeg",
  "/start/results/proof_whatsapp_hairline.jpeg",
  "/start/results/proof_imessage_grateful.jpeg",
  "/start/results/proof_tiktok_almost_working.jpeg",
  "/start/results/proof_reddit_5_month.jpeg",
  "/start/results/proof_whatsapp_one_year.jpeg",
];

// Gender-pure filtering. Reasons documented in the Flutter source.
const EXCLUDE_FOR_WOMEN = [
  "finasteride",
  "one_year",
  "2_days_difference",
  "imessage_grateful",
  "almost_working",
  "whatsapp_hairline",
  "5_month",
  "tiktok_3_months",
  "tiktok_stops_hair_loss",
  "reddit_105_days",
];

const EXCLUDE_FOR_MEN = [
  "proof_women_zukie",
  "tiktok_it_works",
];

export default function ResultScreenshotsStep() {
  const { next, back, answers } = useFlow();
  const gender = answers.gender === "female" ? "female" : "male";

  const gifClips = useMemo(
    () => (gender === "female" ? FEMALE_GIF_CLIPS : MALE_GIF_CLIPS),
    [gender]
  );

  const screenshots = useMemo(() => {
    if (gender === "female") {
      return [
        "/start/results/proof_women_zukie.jpeg",
        ...ALL_SCREENSHOTS.filter(
          (s) => !EXCLUDE_FOR_WOMEN.some((e) => s.includes(e))
        ),
      ];
    }
    return ALL_SCREENSHOTS.filter(
      (s) => !EXCLUDE_FOR_MEN.some((e) => s.includes(e))
    );
  }, [gender]);

  const totalSlides = gifClips.length + screenshots.length;

  const [currentIndex, setCurrentIndex] = useState(0);

  const isGif = currentIndex < gifClips.length;
  const gifIndex = currentIndex;
  const screenshotIndex = currentIndex - gifClips.length;

  const advance = useCallback(() => {
    setCurrentIndex((i) => {
      if (i >= totalSlides - 1) {
        mediumHaptic();
        next();
        return i;
      }
      lightHaptic();
      return i + 1;
    });
  }, [totalSlides, next]);

  const goBack = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((i) => {
        if (i <= 0) {
          // Match mobile: first slide's back does nothing at page level
          // (parent navigation stack handles global back on mobile). On web
          // we route to the previous funnel step so users aren't stranded.
          back();
          return i;
        }
        lightHaptic();
        return i - 1;
      });
    },
    [back]
  );

  // Preload the next slide's asset so the crossfade doesn't flash a blank
  // frame when advancing on a slow connection.
  useEffect(() => {
    const nextIdx = currentIndex + 1;
    if (nextIdx >= totalSlides) return;
    const src =
      nextIdx < gifClips.length
        ? gifClips[nextIdx]
        : screenshots[nextIdx - gifClips.length];
    const img = new window.Image();
    img.src = src;
  }, [currentIndex, gifClips, screenshots, totalSlides]);

  return (
    <div
      onClick={advance}
      style={{
        position: "absolute",
        inset: 0,
        background: colors.black,
        overflow: "hidden",
        cursor: "pointer",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      {/* Media layer — GIFs fill entire screen, screenshots use safe area */}
      <AnimatePresence mode="wait">
        {isGif ? (
          <motion.div
            key={`gif-${gifIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
            style={{ position: "absolute", inset: 0 }}
          >
            <video
              key={gifClips[gifIndex]}
              src={gifClips[gifIndex]}
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            {/* Warm the browser cache for the NEXT 1-2 clips so tap-through
                is instant. Hidden preload="auto" tags let the browser pull
                the bytes while the current clip plays. */}
            {[1, 2].map((offset) => {
              const nextIdx = gifIndex + offset;
              if (nextIdx >= gifClips.length) return null;
              return (
                <video
                  key={`prefetch-${gifClips[nextIdx]}`}
                  src={gifClips[nextIdx]}
                  preload="auto"
                  muted
                  playsInline
                  style={{
                    position: "absolute",
                    width: 1,
                    height: 1,
                    opacity: 0,
                    pointerEvents: "none",
                  }}
                />
              );
            })}
          </motion.div>
        ) : (
          <motion.div
            key={`shot-${screenshotIndex}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0, 0, 0.2, 1] }}
            style={{
              position: "absolute",
              inset: 0,
              // Approximates SafeArea(bottom: false) + 26px top space for the
              // progress bar row + bottom "Tap to continue" label area.
              paddingTop: "calc(env(safe-area-inset-top, 0px) + 38px)",
              paddingBottom: 56,
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
            }}
          >
            <div
              style={{
                flex: 1,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 20px",
                minHeight: 0,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={screenshots[screenshotIndex]}
                alt=""
                draggable={false}
                style={{
                  maxWidth: "100%",
                  maxHeight: "100%",
                  width: "auto",
                  height: "auto",
                  objectFit: "contain",
                  borderRadius: 12,
                  display: "block",
                }}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Tap to continue" hint — sits at the bottom on both GIF and
          screenshot slides. Mobile shows it overlaid on GIFs and in the
          Column footer on screenshots; the visual result is the same. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)",
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 14,
            fontWeight: 400,
            color: "rgba(255,255,255,0.5)",
          }}
        >
          Tap to continue
        </span>
      </div>

      {/* Progress bar */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          padding: `calc(env(safe-area-inset-top, 0px) + 12px) 16px 0`,
          display: "flex",
          gap: 4,
          pointerEvents: "none",
        }}
      >
        {Array.from({ length: totalSlides }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 2.5,
              borderRadius: 2,
              background:
                i <= currentIndex
                  ? "rgba(255,255,255,0.8)"
                  : "rgba(255,255,255,0.15)",
              transition: "background 200ms ease-out",
            }}
          />
        ))}
      </div>

      {/* Back button — appears once past the first slide */}
      {currentIndex > 0 && (
        <button
          type="button"
          onClick={goBack}
          aria-label="Back"
          style={{
            position: "absolute",
            top: "calc(env(safe-area-inset-top, 0px) + 24px)",
            left: 12,
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: "none",
            padding: 0,
            background: "rgba(0,0,0,0.35)",
            color: colors.white,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <svg
            width="12"
            height="16"
            viewBox="0 0 12 16"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M10 2L3 8L10 14"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
