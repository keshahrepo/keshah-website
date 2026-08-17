"use client";

// First screen after an ad click. Job: bridge the ad's promise into the
// physical pinch test without asking for anything yet. One Continue button,
// always enabled — the goal is to keep users past the cold-open wall that
// kills ~80% of paid traffic on PinchTest.pinchTop.
//
// Diagnostic instrumentation (added 2026-05-09): tracks video_loaded /
// video_play_started / video_play_failed / viewed_5s / viewed_15s /
// continue_clicked sub-events so we can tell WHY users bounce on hook
// (page broke vs. autoplay blocked vs. saw it and bounced vs. tapped
// Continue but navigation failed). Combine with the main "hook" and
// "pinchTest" step counts in FunnelEvents to attribute the drop-off.
import { useEffect } from "react";
import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import { trackSubStep } from "../lib/funnel-track";
import styles from "./pinch-test.module.css";

export default function Hook() {
  const { next } = useFlow();
  const config = useFunnelConfig();
  // Creator-specific overrides: static photo + custom headline replace the
  // Aadi hook video on /f/{slug} routes. Falls back to defaults otherwise.
  const creatorHeadline = config.hookHeadline;
  const creatorSubhead = config.hookSubhead;
  const creatorImage = config.hookImage;
  const creatorBio = config.creatorBio;

  useEffect(() => {
    // Prefetch the next step's photos while the user watches the Hook video
    // so Pinch Test feels instant. Just instantiating Image objects triggers
    // the browser to fetch + cache them in the background without rendering
    // or blocking anything. Cheap win for perceived speed on mobile data.
    const prefetch = [
      "/start/pinch_top_photo.jpg",
      "/start/pinch_sides_photo.jpg",
    ];
    for (const src of prefetch) {
      const img = new window.Image();
      img.src = src;
    }

    // Engagement timers — fire if the user is still on the page after 5s
    // and 15s. Distinguishes "bounced before reading" from "saw it, didn't
    // tap Continue." Cleaned up on unmount so they don't fire after nav.
    const t5 = window.setTimeout(() => trackSubStep("hook", "viewed_5s"), 5000);
    const t15 = window.setTimeout(() => trackSubStep("hook", "viewed_15s"), 15000);
    return () => {
      window.clearTimeout(t5);
      window.clearTimeout(t15);
    };
  }, []);

  const handleContinue = () => {
    trackSubStep("hook", "continue_clicked");
    mediumHaptic();
    next();
  };

  // Video event handlers — distinguish loaded-vs-broken and
  // autoplay-worked-vs-blocked. video_play_failed firing in volume means
  // the in-app browser blocked autoplay (we should swap to a poster-only
  // hero or add a tap-to-play overlay).
  const handleVideoLoaded = () => trackSubStep("hook", "video_loaded");
  const handleVideoPlay = () => trackSubStep("hook", "video_play_started");
  const handleVideoError = () => trackSubStep("hook", "video_error");

  return (
    <div className={styles.root}>
      <div
        className={styles.body}
        style={{
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          paddingTop: "calc(env(safe-area-inset-top) + 24px)",
        }}
      >
        <div
          className={`${styles.stepContent} ${styles.fadeSlide}`}
          style={{ flex: 1, minHeight: 0, justifyContent: "flex-start" }}
        >
          <h1 className={styles.headline}>
            {creatorHeadline ?? "Are you losing hair because of a tight scalp?"}
          </h1>
          <p className={styles.description}>
            {creatorSubhead ?? "Let's do the 60-second test and find out."}
          </p>

          {creatorImage ? (
            <div
              style={{
                position: "relative",
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: "column",
                width: "100%",
                marginTop: 24,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={creatorImage}
                alt=""
                className={styles.illustration}
                onLoad={handleVideoLoaded}
                onError={handleVideoError}
                style={{
                  flex: 1,
                  minHeight: 0,
                  height: "auto",
                  maxHeight: "none",
                  objectFit: "contain",
                  background: "var(--bg)",
                  margin: 0,
                }}
              />
              {creatorBio && (
                <div
                  style={{
                    position: "absolute",
                    left: 16,
                    right: 16,
                    bottom: 16,
                    padding: "10px 14px",
                    background: "rgba(255,255,255,0.95)",
                    backdropFilter: "blur(8px)",
                    WebkitBackdropFilter: "blur(8px)",
                    borderRadius: 10,
                    color: "#1a1a1a",
                    fontSize: 13,
                    lineHeight: 1.4,
                    fontWeight: 500,
                    boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    pointerEvents: "none",
                  }}
                >
                  {creatorBio}
                </div>
              )}
            </div>
          ) : (
            <video
              src="/start/aadi_hook.mp4"
              poster="/start/aadi_hook_poster.jpg"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              onLoadedData={handleVideoLoaded}
              onPlay={handleVideoPlay}
              onError={handleVideoError}
              className={styles.illustration}
              style={{
                flex: 1,
                minHeight: 0,
                height: "auto",
                maxHeight: "none",
                objectFit: "contain",
                background: "var(--bg)",
                marginTop: 24,
              }}
            />
          )}
        </div>
      </div>
      <div className={styles.footer}>
        <button type="button" className={styles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
