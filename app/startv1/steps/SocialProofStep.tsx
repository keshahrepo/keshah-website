"use client";

/**
 * SocialProofStep — port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/auth/post_auth_flow_2/pages/social_proof.dart
 *
 * Two kinetic rows of gender-pure result GIFs scrolling in opposite
 * directions, black gradient fades top/bottom, a big audience-aware count
 * ("26,538+" for men / "8,538+" for women), a stars-row social-proof line,
 * and a "Join them" CTA. No Firestore writes on this step.
 *
 * Animation timing (Flutter → framer-motion):
 *   • entrance   1000ms easeOut  — fade + slight zoom-out (scale 1.03→1.0),
 *                                  delayed 200ms
 *   • scroll     20s linear infinite — starts after 900ms
 *   • text       900ms easeOut  — number fade + scale 0.95→1 in first 60%,
 *                                 subtitle fade in last 60%, delayed 1200ms
 *   • button     600ms easeOut  — fade, delayed 1900ms
 */

import { motion } from "framer-motion";
import { useMemo } from "react";
import { useFlow } from "../lib/flow-context";
import { mediumHaptic } from "../lib/haptics";
import { colors } from "../lib/tokens";

// Gender-pure result clips — mirrors the mobile source. Women see only
// women's transformations, men only men's. Files match assets shipped in
// /public/start/results (same names as result_screenshots).
const WOMEN_CLIPS = [
  "/start/results/women_clip_1.gif",
  "/start/results/women_clip_2.gif",
  "/start/results/women_clip_3.gif",
  "/start/results/women_clip_4.gif",
  "/start/results/women_clip_5.gif",
  "/start/results/women_clip_6.gif",
];

const MEN_CLIPS = [
  "/start/results/proof_clip_1.gif",
  "/start/results/proof_clip_2.gif",
  "/start/results/proof_clip_3.gif",
  "/start/results/proof_clip_4.gif",
  "/start/results/proof_clip_5.gif",
  "/start/results/proof_clip_6.gif",
  "/start/results/proof_clip_7.gif",
];

// Card geometry — tuned to the ~9:16 aspect of the source GIFs so
// object-fit: cover doesn't chop off tops/bottoms.
const CARD_WIDTH = 140;
const CARD_HEIGHT = 250;
const CARD_SPACING = 10;
const ROW_SPACING = 12;
const BORDER_RADIUS = 14;
const ROW_COUNT = 2;

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatDate(): string {
  const now = new Date();
  return `${MONTHS[now.getMonth()]} ${now.getDate()}`;
}

interface RowProps {
  photos: string[];
  direction: 1 | -1;
  rowOffsetPx: number;
}

/**
 * A single infinite-scrolling row. Renders the row's photos 3x so we can
 * translate by exactly one set (rowTotalWidth) and loop seamlessly.
 *
 * Even rows scroll right — we start shifted left by one full set so cards
 * always fill the viewport. Odd rows scroll left from the base offset.
 */
function ScrollingRow({ photos, direction, rowOffsetPx }: RowProps) {
  const rowLen = photos.length;
  const rowTotalWidth = rowLen * (CARD_WIDTH + CARD_SPACING);

  // baseOffset mirrors the Flutter math:
  //   row 0 (dir +1): rowOffset - rowTotalWidth   (start shifted left)
  //   row 1 (dir -1): rowOffset                    (start at rowOffset)
  const baseOffset =
    direction === 1 ? rowOffsetPx - rowTotalWidth : rowOffsetPx;

  // Scroll animates translateX by ±rowTotalWidth over 20s — loops seamlessly
  // because we render rowLen * 3 photos.
  const fromX = baseOffset;
  const toX = baseOffset + rowTotalWidth * direction;

  const tripled = Array.from({ length: rowLen * 3 }, (_, col) => {
    const photoIndex = col % rowLen;
    return { key: `${col}`, src: photos[photoIndex] };
  });

  return (
    <div
      style={{
        height: CARD_HEIGHT,
        overflow: "visible",
        position: "relative",
      }}
    >
      <motion.div
        initial={{ x: fromX }}
        animate={{ x: toX }}
        transition={{
          duration: 20,
          ease: "linear",
          repeat: Infinity,
          repeatType: "loop",
          delay: 0.9,
        }}
        style={{
          display: "flex",
          flexDirection: "row",
          willChange: "transform",
        }}
      >
        {tripled.map((p, i) => (
          <div
            key={p.key + "-" + i}
            style={{
              flexShrink: 0,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
              marginRight: CARD_SPACING,
              borderRadius: BORDER_RADIUS,
              overflow: "hidden",
              background: colors.black,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.src}
              alt=""
              draggable={false}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          </div>
        ))}
      </motion.div>
    </div>
  );
}

export default function SocialProofStep() {
  const { next, answers } = useFlow();
  const gender = answers.gender === "female" ? "female" : "male";
  const photos = gender === "female" ? WOMEN_CLIPS : MEN_CLIPS;

  // Split the pool between rows so the same person never appears on both
  // rows at once. Row 0 gets ceil(N/2), row 1 gets the rest.
  const firstHalfLen = Math.ceil(photos.length / 2);
  const row0Photos = photos.slice(0, firstHalfLen);
  const row1Photos = photos.slice(firstHalfLen);

  const formattedDate = useMemo(() => formatDate(), []);

  const numberText = gender === "female" ? "8,538+" : "26,538+";
  const subtitleText =
    gender === "female"
      ? `women have started KESHAH\nin the last 60 days · as of ${formattedDate}`
      : `men have started KESHAH\nin the last 60 days · as of ${formattedDate}`;

  const handleCta = () => {
    mediumHaptic();
    next();
  };

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        background: colors.black,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        WebkitTapHighlightColor: "transparent",
        userSelect: "none",
      }}
    >
      {/* Top area — GIF rows with gradient fades. Flex: 1 to fill space
          above the fixed text/CTA block below. */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>
        {/* Entrance wrapper — 1000ms fade + subtle zoom-out (1.03 → 1.0). */}
        <motion.div
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1.0 }}
          transition={{
            duration: 1.0,
            ease: [0, 0, 0.2, 1], // easeOut
            delay: 0.2,
          }}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-start",
          }}
        >
          {/* Row 0 — scrolls right (direction +1), no horizontal offset. */}
          <div style={{ marginBottom: ROW_SPACING }}>
            <ScrollingRow
              photos={row0Photos}
              direction={1}
              rowOffsetPx={0}
            />
          </div>
          {/* Row 1 — scrolls left (direction -1), shifted so rows aren't
              grid-aligned. */}
          <ScrollingRow
            photos={row1Photos}
            direction={-1}
            rowOffsetPx={-(CARD_WIDTH * 0.3)}
          />
        </motion.div>

        {/* Gradient overlays so the scrolling row blends into the black
            background instead of ending hard. Top 100px, bottom 80px. */}
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: 0,
            height: 100,
            background:
              "linear-gradient(to bottom, #000000 0%, rgba(0,0,0,0) 100%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            height: 80,
            background:
              "linear-gradient(to bottom, rgba(0,0,0,0) 0%, #000000 100%)",
            pointerEvents: "none",
          }}
        />
      </div>

      {/* Number + subtitle + stars — fixed section directly below GIFs. */}
      <div style={{ padding: "4px 32px 16px" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          {/* Number — fades + scales from 0.95 → 1.0 in first 60% of the
              900ms text controller (i.e. 540ms), delayed 1.2s. */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1.0 }}
            transition={{
              duration: 0.54,
              ease: [0, 0, 0.2, 1],
              delay: 1.2,
            }}
            style={{
              fontFamily: "Poppins, -apple-system, sans-serif",
              fontSize: 52,
              fontWeight: 700,
              color: colors.white,
              letterSpacing: -2.5,
              lineHeight: 1.1,
              textAlign: "center",
            }}
          >
            {numberText}
          </motion.div>

          <div style={{ height: 8 }} />

          {/* Subtitle + stars — fades in during the last 60% of the
              text controller (interval 0.4–1.0 of 900ms), so it starts at
              1.2s + 360ms = 1.56s and lasts 540ms. */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{
              duration: 0.54,
              ease: [0, 0, 0.2, 1],
              delay: 1.56,
            }}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
            }}
          >
            <div
              style={{
                fontFamily: "Poppins, -apple-system, sans-serif",
                fontSize: 14,
                fontWeight: 400,
                color: "rgba(255,255,255,0.55)",
                lineHeight: 1.45,
                textAlign: "center",
                whiteSpace: "pre-line",
              }}
            >
              {subtitleText}
            </div>

            <div style={{ height: 12 }} />

            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {/* Apple logo — approximates Flutter's Icons.apple */}
              <AppleIcon color="rgba(255,255,255,0.5)" size={18} />
              <div style={{ width: 4 }} />
              {/* 4 full stars + 1 half star, gold */}
              {[0, 1, 2, 3].map((i) => (
                <StarIcon key={i} color="#FFD700" size={18} />
              ))}
              <StarHalfIcon color="#FFD700" size={18} />
              <div style={{ width: 6 }} />
              <span
                style={{
                  fontFamily: "Poppins, -apple-system, sans-serif",
                  fontSize: 13,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.55)",
                }}
              >
                4.8 on the App Store
              </span>
            </div>
          </motion.div>
        </div>
      </div>

      {/* CTA — fades in 600ms easeOut, delayed 1.9s. */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.6,
          ease: [0, 0, 0.2, 1],
          delay: 1.9,
        }}
        style={{
          padding: "0 25px 35px",
        }}
      >
        <button
          type="button"
          onClick={handleCta}
          style={{
            width: "100%",
            padding: "18px 0",
            background: colors.white,
            color: colors.black,
            border: "none",
            borderRadius: 40,
            fontFamily: "Poppins, -apple-system, sans-serif",
            fontSize: 16,
            fontWeight: 500,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          Join them
        </button>
      </motion.div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────
// Inline SVGs approximating Flutter's Icons.apple / star_rounded /
// star_half_rounded so we don't pull in an icon library.

function AppleIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
    >
      <path d="M17.05 20.28c-.98.95-2.05.88-3.08.41-1.09-.47-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.41C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.08zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function StarIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      aria-hidden="true"
    >
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  );
}

function StarHalfIcon({ color, size }: { color: string; size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="starHalfGrad">
          <stop offset="50%" stopColor={color} />
          <stop offset="50%" stopColor="rgba(255,255,255,0.15)" />
        </linearGradient>
      </defs>
      <path
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
        fill="url(#starHalfGrad)"
      />
    </svg>
  );
}
