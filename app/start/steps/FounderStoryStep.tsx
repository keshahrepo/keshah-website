"use client";

/**
 * FounderStoryStep — direct web port of
 * /Users/aadityaagrawal/KESHAH-Mobile-App/lib/screens/founder_story/founder_story_page.dart
 *
 * 23-beat cinematic narrative (Aadi's hair-loss story). Tap right of screen
 * to advance, tap left quarter to go back. Text fades + slides in on every
 * beat (~600ms), images fade in ~200ms later (~500ms). Full-screen photo
 * beats stretch the image behind a top+bottom gradient with the text
 * bottom-aligned over it. The mechanism beat uses the shared
 * BloodVesselAnimation (SVG port of the Flutter CustomPainter). The
 * Huberman clip is rendered as a muted looping <video>. The final beat
 * swaps "Tap to continue" for a fade-in "Let's go" pill button.
 *
 * NOTE: Mobile writes `founder_story_started_at` to the Users doc on
 * mount (merge, set-if-missing). On web the user is anonymous at this
 * point in the funnel, so there is nothing to write to Firestore here —
 * quiz answers persist locally via flow-context and are flushed after
 * SignUp.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useFlow } from "../lib/flow-context";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { colors } from "../lib/tokens";
import BloodVesselAnimation from "../components/BloodVesselAnimation";

type Span = { text: string; italic?: boolean };

interface StoryBeat {
  text: string;
  spans?: Span[];
  imagePath?: string;
  stackedImages?: string[];
  sideBySideImages?: string[];
  sideBySideLabels?: string[];
  imageCaption?: string;
  isLastScreen?: boolean;
  fullScreenImage?: boolean;
  hasAnimation?: boolean;
  videoPath?: string;
  videoCaption?: string;
}

function buildBeats(firstName?: string): StoryBeat[] {
  const name = (firstName ?? "").split(" ")[0]?.trim() ?? "";
  const greeting = name.length > 0 ? `Hey ${name}.\n\n` : "";

  return [
    // Beat 1: Hook
    {
      text: `${greeting}4 years ago I was losing my hair. I thought nothing could fix it.\n\nHere's my story.`,
    },
    // Beat 2: Before photo — FULL SCREEN
    {
      text: "My crown was thinning and my hairline was going back.",
      imagePath: "/start/story/before_hairline.jpg",
      fullScreenImage: true,
    },
    // Beat 3: Failed remedies
    {
      text:
        "I tried everything. Rosemary oil. Onion juice. Ayurvedic oils. Every shampoo. Every supplement I could find.\n\nNothing worked.",
    },
    // Beat 4: Doctor
    {
      text:
        "I went to a dermatologist. He said “take finasteride and minoxidil or you'll go bald in 2-3 years.”",
    },
    // Beat 5: Internal conflict
    {
      text:
        "I didn't want to take pills for the rest of my life. But I didn't want to go bald either.\n\nThe anxiety was killing me.",
    },
    // Beat 6: Caved — bought finasteride
    {
      text:
        "I gave in. I went to Walgreens and bought a bottle of finasteride and put it on my bedside table.",
    },
    // Beat 7: The night before
    { text: "I told myself I'd start taking it the next morning." },
    // Beat 8: Couldn't sleep
    { text: "I couldn't sleep that night." },
    // Beat 9: Reddit rabbit hole
    {
      text:
        "I went down a rabbit hole. I found real people on Reddit who said scalp massage stopped their hair loss.",
      spans: [
        {
          text:
            "I went down a rabbit hole. I found real people on Reddit who said scalp massage ",
        },
        { text: "stopped", italic: true },
        { text: " their hair loss." },
      ],
      stackedImages: [
        "/start/story/reddit_1.png",
        "/start/story/reddit_2.png",
        "/start/story/reddit_3.png",
        "/start/story/reddit_4.png",
      ],
      imageCaption:
        "These are the exact comments I read 4 years ago. They're still up.",
    },
    // Beat 10: Skepticism
    { text: "I didn't believe them. I'd been let down too many times." },
    // Beat 11: The study
    {
      text:
        "Then I found a study. The places you lose hair first? Those are the tightest parts of your scalp.",
      imagePath: "/start/story/scalp_tension_study.jpg",
      imageCaption:
        "The hairline and crown are tightest (shown in light blue). And that's where we generally first lose hair. (Byun et al., 2015)",
    },
    // Beat 12: Mechanism
    {
      text:
        "When your scalp is tight, the blood vessels get choked. Less blood reaches your hair. Without blood, hair cannot grow.",
      hasAnimation: true,
    },
    // Beat 13: Personal proof
    {
      text: "I felt my scalp properly for the first time. It was very tight.",
      spans: [
        { text: "I felt my scalp properly for the first time. It was " },
        { text: "very", italic: true },
        { text: " tight." },
      ],
    },
    // Beat 14: Hypothesis
    {
      text:
        "If I could loosen up my scalp and fix the blood flow, maybe my hair fall would stop?",
    },
    // Beat 15: Decision
    { text: "It sounded too simple to actually work. But I had nothing to lose." },
    // Beat 16: The plan
    { text: "So I made a plan. 6 scalp + neck techniques. And I started." },
    // Beat 17: The work
    {
      text:
        "This wasn't gentle massage. I had to apply a lot of force. It felt like a workout.",
    },
    // Beat 18: Results — first few days
    { text: "The first few days I could barely pinch my scalp at all." },
    // Beat 19: Results — day 7
    {
      text:
        "After about a week I felt that something was happening. My scalp felt a bit looser after I finished my sessions.",
      spans: [
        { text: "After about a week I felt that " },
        { text: "something", italic: true },
        {
          text:
            " was happening. My scalp felt a bit looser after I finished my sessions.",
        },
      ],
    },
    // Beat 20: Results — day 30
    { text: "By day 30 I could pinch and lift almost any part of my scalp." },
    // Beat 21: Results — 45 days
    { text: "After 45 days I started to notice less hair in the shower." },
    // Beat 22: Results — 60 days (before/after)
    {
      text: "By day 60 my hair fall pretty much completely stopped.",
      sideBySideImages: [
        "/start/story/before_hairline.jpg",
        "/start/story/after_hairline.jpg",
      ],
      sideBySideLabels: ["Before", "After"],
    },
    // Beat 23: My hair now — FULL SCREEN
    {
      text: "My hair now.",
      imagePath: "/start/story/after_selfie_2.jpg",
      imageCaption: "Aadi, KESHAH Founder",
      fullScreenImage: true,
    },
    // Beat 24: Huberman
    {
      text: "Now, science is catching up.",
      videoPath: "/start/video/huberman_clip.mp4",
      videoCaption:
        "Dr. Andrew Huberman\nNeuroscientist, Stanford University",
    },
    // Beat 25: The question
    {
      text: "I had one question left: how doesn't everyone know about this?",
      spans: [
        { text: "I had one question left: " },
        { text: "how doesn't everyone know about this?", italic: true },
      ],
    },
    // Beat 26: Now I help people make their own plan + volume proof.
    // Instagram + TikTok screenshots as the visual — same socials shown
    // in other places, keeps proof consistent across the funnel.
    {
      text:
        "Now I help people who don't want to take drugs figure out their own plan. I've been lucky enough to help more than 1,500 people in the last 2 years alone.",
      stackedImages: [
        "/trial/aadi_instagram.jpg",
        "/trial/aadi_tiktok.jpg",
      ],
    },
    // Beat 27: CTA
    { text: "It's in your hands now.", isLastScreen: true },
  ];
}

// Font stack used across all mobile Poppins text.
const FONT = "Poppins, -apple-system, sans-serif";

// Body text style — used by every standard beat.
const BODY_TEXT_STYLE: React.CSSProperties = {
  fontFamily: FONT,
  fontSize: 20,
  fontWeight: 500,
  color: colors.white,
  lineHeight: 1.5,
  letterSpacing: -0.3,
  whiteSpace: "pre-line",
};

// Framer-motion transition matching the mobile 600ms textController (fade
// on 0-0.7 easeOut, slide on 0-0.8 easeOutCubic). We approximate with a
// single ~0.5s fade + slide-up from 8% of the container, which reads the
// same at 60fps.
const TEXT_TRANSITION = { duration: 0.5, ease: [0.215, 0.61, 0.355, 1] as const };
const IMAGE_TRANSITION = { duration: 0.5, ease: [0.215, 0.61, 0.355, 1] as const, delay: 0.2 };

export default function FounderStoryStep() {
  const { answers, next } = useFlow();
  const beats = useMemo(() => buildBeats(answers.firstName), [answers.firstName]);

  const [currentPage, setCurrentPage] = useState(0);
  const [showCta, setShowCta] = useState(false);
  const beat = beats[currentPage];

  // On the last beat, fade the "Let's go" button in 800ms after the beat
  // lands — matches the tuned-down _logoController delay in the mobile
  // source ("felt like the CTA was hiding after 'It's in your hands now'
  // landed").
  useEffect(() => {
    setShowCta(false);
    if (!beat.isLastScreen) return;
    const t = window.setTimeout(() => setShowCta(true), 800);
    return () => window.clearTimeout(t);
  }, [currentPage, beat.isLastScreen]);

  const advance = useCallback(() => {
    if (currentPage >= beats.length - 1) {
      mediumHaptic();
      next();
      return;
    }
    lightHaptic();
    setCurrentPage((p) => p + 1);
  }, [currentPage, beats.length, next]);

  const goBack = useCallback(() => {
    if (currentPage <= 0) return;
    lightHaptic();
    setCurrentPage((p) => p - 1);
  }, [currentPage]);

  // Keyboard support — arrow / space for advance, backspace for back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
        e.preventDefault();
        advance();
      } else if (e.key === "ArrowLeft" || e.key === "Backspace") {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [advance, goBack]);

  const handleTap = (ev: React.MouseEvent<HTMLDivElement>) => {
    const rect = ev.currentTarget.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    if (x < rect.width * 0.25) {
      goBack();
    } else if (!beat.isLastScreen) {
      advance();
    }
  };

  const isFullScreen = Boolean(beat.fullScreenImage && beat.imagePath);

  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        flex: 1,
        width: "100%",
        minHeight: 0,
        background: colors.black,
        color: colors.white,
        overflow: "hidden",
      }}
    >
      {/* Warm the browser cache for videos that appear later in the story
          (Huberman clip on beat 24). Hidden preload="auto" lets the browser
          pull the ~8MB while the user is still on the early beats. */}
      <video
        src="/start/video/huberman_clip.mp4"
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
      {/* Full-screen background image + gradient overlay on visual beats */}
      {isFullScreen && (
        <AnimatePresence>
          <motion.div
            key={`bg-${currentPage}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={IMAGE_TRANSITION}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 0,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={beat.imagePath!}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
            <div
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background:
                  "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.05) 30%, rgba(0,0,0,0.05) 55%, rgba(0,0,0,0.65) 100%)",
              }}
            />
          </motion.div>
        </AnimatePresence>
      )}

      {/* UI layer */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          display: "flex",
          flexDirection: "column",
          flex: 1,
          minHeight: 0,
          width: "100%",
        }}
      >
        {/* Progress bar */}
        <div
          style={{
            padding: "12px 16px 0",
            display: "flex",
            flexDirection: "row",
            gap: 4,
            width: "100%",
            boxSizing: "border-box",
          }}
        >
          {beats.map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                height: 2.5,
                borderRadius: 2,
                background:
                  i <= currentPage
                    ? "rgba(255,255,255,0.8)"
                    : "rgba(255,255,255,0.15)",
              }}
            />
          ))}
        </div>

        {/* Tappable content area */}
        <div
          role="button"
          tabIndex={-1}
          onClick={handleTap}
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: "column",
            cursor: beat.isLastScreen ? "default" : "pointer",
          }}
        >
          {isFullScreen ? (
            <FullScreenOverlayContent beat={beat} pageKey={currentPage} />
          ) : (
            <StandardContent beat={beat} pageKey={currentPage} />
          )}
        </div>

        {/* Bottom bar */}
        <div style={{ padding: "0 25px 20px" }}>
          {beat.isLastScreen ? (
            <motion.button
              type="button"
              initial={{ opacity: 0 }}
              animate={{ opacity: showCta ? 1 : 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
              onClick={advance}
              style={{
                width: "100%",
                padding: "18px 0",
                background: colors.white,
                color: colors.black,
                borderRadius: 40,
                border: "none",
                fontFamily: FONT,
                fontSize: 16,
                fontWeight: 600,
                cursor: showCta ? "pointer" : "default",
              }}
            >
              Let&apos;s go
            </motion.button>
          ) : (
            <div
              onClick={advance}
              style={{
                padding: "16px 0",
                textAlign: "center",
                fontFamily: FONT,
                fontSize: 14,
                fontWeight: 400,
                color: "rgba(255,255,255,0.5)",
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              Tap to continue
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Full-screen photo beats — bottom-aligned text over gradient
// ─────────────────────────────────────────────────────────────────────────
function FullScreenOverlayContent({
  beat,
  pageKey,
}: {
  beat: StoryBeat;
  pageKey: number;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        padding: "0 28px 40px",
        minHeight: 0,
      }}
    >
      <motion.div
        key={`fs-text-${pageKey}`}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={TEXT_TRANSITION}
      >
        <p
          style={{
            ...BODY_TEXT_STYLE,
            margin: 0,
            textAlign: "left",
            width: "100%",
          }}
        >
          {beat.text}
        </p>
        {beat.imageCaption && (
          <p
            style={{
              marginTop: 10,
              marginBottom: 0,
              fontFamily: FONT,
              fontSize: 12,
              fontWeight: 400,
              color: "rgba(255,255,255,0.5)",
              whiteSpace: "pre-line",
            }}
          >
            {beat.imageCaption}
          </p>
        )}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Standard beats — text on top, optional media below
// ─────────────────────────────────────────────────────────────────────────
function StandardContent({
  beat,
  pageKey,
}: {
  beat: StoryBeat;
  pageKey: number;
}) {
  const centered = Boolean(beat.isLastScreen);

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        padding: "0 28px",
        minHeight: 0,
        alignItems: centered ? "center" : "stretch",
      }}
    >
      {/* Top spacer — video pushes content up (15% of viewport), everything
          else uses flex-2 spacer above / flex-1 (or none) below. */}
      {beat.videoPath ? (
        <div style={{ height: "15vh" }} />
      ) : (
        <div
          style={{
            flex: beat.sideBySideImages ? 1 : beat.text.length === 0 ? 1 : 2,
          }}
        />
      )}

      {/* Text */}
      {beat.text.length > 0 && (
        <motion.div
          key={`text-${pageKey}`}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={TEXT_TRANSITION}
          style={{
            width: "100%",
            display: "flex",
            justifyContent: centered ? "center" : "flex-start",
          }}
        >
          <p
            style={{
              ...BODY_TEXT_STYLE,
              margin: 0,
              width: "100%",
              textAlign: centered ? "center" : "left",
            }}
          >
            {beat.spans && beat.spans.length > 0
              ? beat.spans.map((s, i) => (
                  <span
                    key={i}
                    style={s.italic ? { fontStyle: "italic" } : undefined}
                  >
                    {s.text}
                  </span>
                ))
              : beat.text}
          </p>
        </motion.div>
      )}

      {/* Side-by-side (before/after) images */}
      {beat.sideBySideImages && beat.sideBySideImages.length > 0 && (
        <>
          <div style={{ height: 24 }} />
          <motion.div
            key={`sbs-${pageKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={IMAGE_TRANSITION}
            style={{
              display: "flex",
              flexDirection: "row",
              gap: 10,
              flex: 2,
              minHeight: 0,
              width: "100%",
            }}
          >
            {beat.sideBySideImages.map((src, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    flex: 1,
                    width: "100%",
                    borderRadius: 10,
                    overflow: "hidden",
                    minHeight: 0,
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      display: "block",
                    }}
                  />
                </div>
                {beat.sideBySideLabels && beat.sideBySideLabels[i] && (
                  <>
                    <div style={{ height: 8 }} />
                    <span
                      style={{
                        fontFamily: FONT,
                        fontSize: 13,
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.6)",
                      }}
                    >
                      {beat.sideBySideLabels[i]}
                    </span>
                  </>
                )}
              </div>
            ))}
          </motion.div>
          <div style={{ flex: 1 }} />
        </>
      )}

      {/* Stacked screenshots (Reddit) */}
      {beat.stackedImages && beat.stackedImages.length > 0 && (
        <>
          <div style={{ height: 24 }} />
          <motion.div
            key={`stack-${pageKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={IMAGE_TRANSITION}
            style={{
              flex: 3,
              minHeight: 0,
              overflowY: "auto",
              width: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            {beat.stackedImages.map((src, i) => (
              <div key={i} style={{ marginTop: i > 0 ? 12 : 0 }}>
                <div
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    width: "100%",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={src}
                    alt=""
                    style={{ width: "100%", display: "block" }}
                  />
                </div>
              </div>
            ))}
            {beat.imageCaption && (
              <p
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  fontFamily: FONT,
                  fontSize: 12,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.35)",
                  textAlign: "left",
                  whiteSpace: "pre-line",
                }}
              >
                {beat.imageCaption}
              </p>
            )}
          </motion.div>
        </>
      )}

      {/* Blood-vessel mechanism animation */}
      {beat.hasAnimation && (
        <>
          <div style={{ height: 32 }} />
          <motion.div
            key={`anim-${pageKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={IMAGE_TRANSITION}
            style={{ width: "100%", color: colors.white }}
          >
            <BloodVesselAnimation
              width={320}
              height={200}
              className="founder-story-vessel"
            />
          </motion.div>
          <div style={{ flex: 1 }} />
        </>
      )}

      {/* Video (Huberman clip) */}
      {beat.videoPath && (
        <>
          <div style={{ height: 8 }} />
          <motion.div
            key={`video-${pageKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={IMAGE_TRANSITION}
            style={{
              width: "100%",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div
              style={{
                borderRadius: 12,
                overflow: "hidden",
                width: "100%",
                height: "35vh",
                background: colors.black,
              }}
            >
              <video
                key={beat.videoPath}
                src={beat.videoPath}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            </div>
            {beat.videoCaption && (
              <p
                style={{
                  marginTop: 10,
                  marginBottom: 0,
                  fontFamily: FONT,
                  fontSize: 11,
                  fontWeight: 400,
                  color: "rgba(255,255,255,0.4)",
                  lineHeight: 1.4,
                  textAlign: "left",
                  whiteSpace: "pre-line",
                }}
              >
                {beat.videoCaption}
              </p>
            )}
          </motion.div>
        </>
      )}

      {/* Single (non-fullscreen) image, e.g. study diagram */}
      {beat.imagePath &&
        !beat.fullScreenImage &&
        !beat.stackedImages &&
        !beat.sideBySideImages && (
          <>
            <div style={{ height: 24 }} />
            <motion.div
              key={`img-${pageKey}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={IMAGE_TRANSITION}
              style={{ width: "100%" }}
            >
              <div
                style={{ borderRadius: 12, overflow: "hidden", width: "100%" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={beat.imagePath}
                  alt=""
                  style={{ width: "100%", display: "block" }}
                />
              </div>
              {beat.imageCaption && (
                <p
                  style={{
                    marginTop: 10,
                    marginBottom: 0,
                    fontFamily: FONT,
                    fontSize: 12,
                    fontWeight: 400,
                    color: "rgba(255,255,255,0.35)",
                    textAlign: "left",
                    whiteSpace: "pre-line",
                  }}
                >
                  {beat.imageCaption}
                </p>
              )}
            </motion.div>
            <div style={{ flex: 1 }} />
          </>
        )}

      {/* Text-only bottom spacer */}
      {!beat.imagePath &&
        !beat.stackedImages &&
        !beat.sideBySideImages &&
        !beat.hasAnimation &&
        !beat.videoPath && <div style={{ flex: 3 }} />}
    </div>
  );
}
