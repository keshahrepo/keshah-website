"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { doc, getFirestore, serverTimestamp, setDoc } from "firebase/firestore";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { currentUser } from "../lib/firebase-client";
import { lightHaptic, mediumHaptic } from "../lib/haptics";
import { trackSubStep } from "../lib/funnel-track";
import { buildBeats, type StoryBeat } from "./founder-story-data";
import BloodVesselAnimation from "../components/BloodVesselAnimation";
import DisqualificationScreen from "../components/DisqualificationScreen";
import styles from "./founder-story.module.css";

export default function FounderStory() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();

  // Three modes, gated in this order:
  //   1. Creator origin beats present → render them in this component's
  //      cinematic chrome (light theme if config.theme=light)
  //   2. skipFounderStory + no creator beats → auto-skip (women's mandy
  //      funnel uses WhyItHappens instead)
  //   3. Default → render Aadi's 25-beat founder story
  const creatorBeats = config.originStoryBeats;
  const hasCreatorBeats = !!creatorBeats?.length;
  const skip = config.skipFounderStory && !hasCreatorBeats;

  useEffect(() => {
    if (skip) next();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  // Map creator beats to the StoryBeat shape so they render in the same
  // chrome as Aadi's beats. Last beat gets isLastScreen so the bottom CTA
  // ("Let's go") replaces "Tap to continue" — same handoff pattern.
  const beats: StoryBeat[] = useMemo(() => {
    if (hasCreatorBeats && creatorBeats) {
      return creatorBeats.map((b, i) => ({
        text: b.body ? `${b.title}\n\n${b.body}` : b.title,
        imagePath: b.image,
        isLastScreen: i === creatorBeats.length - 1,
      }));
    }
    // Post-process buildBeats() output so the rendered story matches mobile
    // source of truth (KESHAH-Mobile-App/lib/screens/founder_story/…).
    // Edits live here rather than in founder-story-data.tsx so this file
    // stays the single owner of parity drifts while the data module keeps
    // its 1:1 Flutter port shape.
    const raw = buildBeats();
    const rawFirstName = answers.firstName?.split(" ")[0]?.trim();
    // Only greet when we actually have a name (e.g., /startindia collects
    // firstName before founderStory). Otherwise fall through to the hook
    // without a bare "Hey ." dangling.
    const greeting = rawFirstName ? `Hey ${rawFirstName}.\n\n` : "";

    const processed: StoryBeat[] = [];

    // Mobile Beat 1: hook + optional personalized greeting. Web had dropped
    // this beat entirely; restored so the story doesn't jump straight into
    // the before-photo with no textual on-ramp.
    processed.push({
      text: `${greeting}4 years ago I was losing my hair. I thought nothing could fix it.\n\nHere's my story.`,
    });

    for (const beat of raw) {
      // Drop the web-only n=1→n=many bridge beat ("But was it just me?" +
      // Jonathon MP4). Mobile has no equivalent — the story goes straight
      // from "My hair now." to the Huberman clip.
      if (beat.text.startsWith("But was it just me?")) continue;

      // Reddit beat: "scalp massages" (plural) → "scalp massage" (singular)
      // to match mobile. Update both plain text and the rich JSX render.
      if (beat.text.includes("real people on Reddit who said scalp massages")) {
        processed.push({
          ...beat,
          text: beat.text.replace(
            "scalp massages stopped their hair loss.",
            "scalp massage stopped their hair loss.",
          ),
          rich: (
            <>
              I went down a rabbit hole. I found real people on Reddit who said scalp massage{" "}
              <em>stopped</em> their hair loss.
            </>
          ),
        });
        continue;
      }

      // Restore mobile's three separate results-progression beats. Web had
      // collapsed the day-1 and day-30 payoffs into a single screen and
      // dropped the pivotal "after about a week … something was happening"
      // beat entirely — the paywall intro calls back that exact italic
      // "something", so the beat has to exist as its own screen.
      if (
        beat.text ===
        "The first few days I could barely pinch my scalp at all. After 30 days it started to get much looser."
      ) {
        processed.push({
          text: "The first few days I could barely pinch my scalp at all.",
        });
        processed.push({
          text: "After about a week I felt that something was happening. My scalp felt a bit looser after I finished my sessions.",
          rich: (
            <>
              After about a week I felt that <em>something</em> was happening. My scalp felt a bit
              looser after I finished my sessions.
            </>
          ),
        });
        processed.push({
          text: "By day 30 I could pinch and lift almost any part of my scalp.",
        });
        continue;
      }

      // "Built the app" beat — restore mobile canonical copy including the
      // product name (KESHAH MechanoTherapy) that web had dropped.
      if (beat.text.startsWith("So I put everything.")) {
        processed.push({
          text: "So I put everything. All my research. All the techniques. The exact plan I followed. All of it into an app. I called it KESHAH MechanoTherapy.",
        });
        continue;
      }

      processed.push(beat);
    }

    return processed;
  }, [hasCreatorBeats, creatorBeats, answers.firstName]);

  const [index, setIndex] = useState(0);
  // Soft-exit state for creator funnels — when user picks "No, I'm good
  // for now" on the handoff beat, swap the screen for a respectful exit
  // (DisqualificationScreen pattern) with a reconsider button.
  const [softExit, setSoftExit] = useState(false);

  const beat = beats[index];
  const isLast = beat.isLastScreen === true;
  const isLight = config.theme === "light";
  // Creator funnels get a yes/no handoff on the final beat (instead of a
  // single "Let's go" CTA). The "?" in the beat title earns an explicit
  // answer, and "No" gives the user a respectful out.
  const showHandoffChoice = hasCreatorBeats && isLast;

  // Track each beat view for funnel analytics — use a distinct namespace
  // for creator beats so analytics don't conflate Aadi's 25-beat path
  // with creator origin paths (different beat counts, different content).
  useEffect(() => {
    if (skip) return;
    const parent = hasCreatorBeats ? "creatorOrigin" : "founderStory";
    trackSubStep(parent, `beat_${index + 1}`);
  }, [index, skip, hasCreatorBeats]);

  // Milestone write — matches mobile FounderStoryPage.initState which sets
  // Users/{uid}.founder_story_started_at (serverTimestamp, merge). The
  // dashboard onboarding funnel reads this field as the earliest "new-build
  // started" signal, so without it web users never appear in the funnel.
  // Guarded: /start (US) has no auth yet, /startindia has an anon UID from
  // PhoneNumber — skip silently when no user exists so we don't error out.
  useEffect(() => {
    if (skip) return;
    const u = currentUser();
    if (!u) return;
    const db = getFirestore();
    setDoc(
      doc(db, "Users", u.uid),
      { founder_story_started_at: serverTimestamp() },
      { merge: true },
    ).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[founder-story] milestone write failed", err);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip]);

  if (skip) return null;

  const advance = () => {
    if (index >= beats.length - 1) {
      mediumHaptic();
      next();
      return;
    }
    lightHaptic();
    setIndex((i) => i + 1);
  };

  const goBack = () => {
    if (index <= 0) return;
    lightHaptic();
    setIndex((i) => i - 1);
  };

  // Block tap-to-advance on the last screen — user must press the explicit button.
  const handleForwardTap = () => {
    if (isLast) return;
    advance();
  };

  // Light-theme overrides for creator funnels (theme=light). Re-defines
  // the CSS variables the .module.css consumes — every text/background
  // colour flips to the cream palette without duplicating styles.
  const lightThemeStyle: React.CSSProperties | undefined = isLight
    ? ({
        ["--bg" as string]: "#FAF7F2",
        ["--text" as string]: "#1A1A1A",
        ["--fg-50" as string]: "rgba(26,26,26,0.5)",
        ["--fg-30" as string]: "rgba(26,26,26,0.3)",
      } as React.CSSProperties)
    : undefined;

  if (softExit) {
    return (
      <DisqualificationScreen
        message="Thanks for visiting."
        subtext="Come back anytime — your hair will be here when you're ready."
        onGoBack={() => {
          lightHaptic();
          setSoftExit(false);
        }}
      />
    );
  }

  return (
    <div className={styles.root} style={lightThemeStyle}>
      {beat.fullScreenImage && beat.imagePath && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={`bg-${index}`}
            src={beat.imagePath}
            alt=""
            className={`${styles.fullBg} ${styles.animateImage}`}
          />
          <div className={styles.fullBgGradient} />
        </>
      )}

      <div className={styles.layer}>
        <ProgressBar total={beats.length} current={index} />

        <div className={styles.tapZones}>
          <button
            type="button"
            aria-label="Go back"
            className={styles.tapBack}
            onClick={goBack}
            style={{ background: "transparent", border: 0 }}
          />
          <button
            type="button"
            aria-label="Continue"
            className={styles.tapForward}
            onClick={handleForwardTap}
            style={{ background: "transparent", border: 0 }}
          />

          <BeatContent key={`beat-${index}`} beat={beat} />
        </div>

        <div className={styles.bottomBar}>
          {showHandoffChoice ? (
            // Creator funnel handoff — explicit yes/no on the final beat.
            // Yes proceeds to the quiz. No shows a soft-exit screen with a
            // reconsider button (DisqualificationScreen pattern).
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                type="button"
                className={`${styles.ctaBtn} ${styles.animateCta}`}
                onClick={advance}
              >
                Yes, let&apos;s see if this can help me!
              </button>
              <button
                type="button"
                onClick={() => {
                  lightHaptic();
                  setSoftExit(true);
                }}
                style={{
                  background: "transparent",
                  border: 0,
                  padding: "12px 0",
                  fontFamily: "inherit",
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--fg-50)",
                  cursor: "pointer",
                }}
              >
                No, I&apos;m good for now
              </button>
            </div>
          ) : isLast ? (
            <button
              type="button"
              className={`${styles.ctaBtn} ${styles.animateCta}`}
              onClick={advance}
            >
              Let&apos;s go
            </button>
          ) : (
            <div className={styles.tapHint}>Tap to continue</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({ total, current }: { total: number; current: number }) {
  return (
    <div className={styles.progressRow}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={`${styles.progressSeg} ${i <= current ? styles.progressSegActive : ""}`}
        />
      ))}
    </div>
  );
}

function BeatContent({ beat }: { beat: StoryBeat }) {
  // Full-screen image: render text overlay only (image is rendered in the parent).
  if (beat.fullScreenImage) {
    return (
      <div className={styles.fullOverlay}>
        <div className={styles.animateText}>
          <p className={styles.fullOverlayText}>{beat.rich ?? beat.text}</p>
          {beat.imageCaption && <p className={`${styles.caption} ${styles.captionLight}`}>{beat.imageCaption}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.standard}>
      <div className={styles.standardTextWrap}>
        <p className={`${styles.standardText} ${beat.isLastScreen ? styles.standardTextCenter : ""} ${styles.animateText}`}>
          {beat.rich ?? beat.text}
        </p>

        {beat.sideBySideImages && beat.sideBySideImages.length > 0 && (
          <div className={`${styles.sideBySideWrap} ${styles.animateImage}`}>
            {beat.sideBySideImages.map((src, i) => (
              <div key={src} className={styles.sideBySideItem}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className={styles.sideBySideImage} />
                {beat.sideBySideLabels && beat.sideBySideLabels[i] && (
                  <div className={styles.sideBySideLabel}>{beat.sideBySideLabels[i]}</div>
                )}
              </div>
            ))}
          </div>
        )}

        {beat.stackedImages && beat.stackedImages.length > 0 && (
          <div className={`${styles.stackedWrap} ${styles.animateImage}`}>
            {beat.stackedImages.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={src} src={src} alt="" className={styles.stackedImage} />
            ))}
            {beat.imageCaption && <p className={styles.caption}>{beat.imageCaption}</p>}
          </div>
        )}

        {beat.hasAnimation && (
          <div className={`${styles.bloodVesselWrap} ${styles.animateImage}`}>
            <BloodVesselAnimation className={styles.bloodVessel} />
          </div>
        )}

        {beat.videoPath && <VideoBeat src={beat.videoPath} caption={beat.videoCaption} />}

        {beat.imagePath && !beat.fullScreenImage && !beat.stackedImages && !beat.sideBySideImages && (
          <div
            className={`${
              beat.imageSmall ? styles.singleImageWrapSmall : styles.singleImageWrap
            } ${styles.animateImage}`}
          >
            {beat.imagePath.endsWith(".mp4") ? (
              // Video clips (e.g. Jonathon transformation in Beat 22) — render
              // as muted autoplay video for hardware-accelerated playback.
              <video
                src={beat.imagePath}
                className={beat.imageSmall ? styles.singleImageSmall : styles.singleImage}
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                disablePictureInPicture
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={beat.imagePath}
                alt=""
                className={beat.imageSmall ? styles.singleImageSmall : styles.singleImage}
              />
            )}
            {beat.imageCaption && (
              <p className={beat.imageSmall ? styles.captionCentered : styles.caption}>
                {beat.imageCaption}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function VideoBeat({ src, caption }: { src: string; caption?: string }) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    // Best-effort autoplay; muted is required by mobile browsers.
    v.muted = true;
    v.play().catch(() => {});
  }, []);

  return (
    <div className={`${styles.videoWrap} ${styles.animateImage}`}>
      <video
        ref={ref}
        className={styles.videoFrame}
        src={src}
        playsInline
        muted
        loop
        controls={false}
        // preload="auto" — start buffering the video bytes immediately when
        // the beat mounts. Combined with the layout-level prefetch, the video
        // should be fully cached by the time the user reaches this beat.
        preload="auto"
      />
      {caption && <p className={styles.videoCaption}>{caption}</p>}
    </div>
  );
}

// BloodVesselAnimation extracted to ../components/BloodVesselAnimation.tsx
// so /mandy's WhyItHappens step can render the same animated diagram.
