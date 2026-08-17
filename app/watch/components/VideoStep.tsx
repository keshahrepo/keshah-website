"use client";

// Full-bleed vertical video with a "filling" Continue pill that grows as the
// video plays and only becomes tappable when the video completes (100%).
// Users can tap the video to play/pause (starts muted for mobile autoplay,
// with a small "tap to unmute" hint until the first user gesture).

import { useEffect, useRef, useState } from "react";
import { lightHaptic, mediumHaptic } from "../../start/lib/haptics";

interface Props {
  src: string;
  onComplete: () => void;
  ctaLabel?: string;
}

export default function VideoStep({ src, onComplete, ctaLabel = "Continue" }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTime = () => {
      if (!v.duration || Number.isNaN(v.duration)) return;
      setProgress(Math.min(1, v.currentTime / v.duration));
    };
    const onEnded = () => {
      setProgress(1);
      setEnded(true);
      mediumHaptic();
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("ended", onEnded);
    };
  }, []);

  const handleVideoTap = () => {
    const v = videoRef.current;
    if (!v) return;
    lightHaptic();
    if (muted) {
      v.muted = false;
      setMuted(false);
      if (v.paused) void v.play();
      return;
    }
    if (v.paused) void v.play();
    else v.pause();
  };

  const handleCta = () => {
    if (!ended) return;
    mediumHaptic();
    onComplete();
  };

  const fillPct = Math.round(progress * 100);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "#000",
        overflow: "hidden",
        fontFamily: "Poppins, -apple-system, sans-serif",
      }}
    >
      {/* Video fills the whole viewport. Button floats above it as a fixed
          element so it can never be pushed off-screen by video resize / mobile
          browser chrome shifts. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          cursor: "pointer",
        }}
        onClick={handleVideoTap}
      >
        <video
          ref={videoRef}
          src={src}
          autoPlay
          muted
          playsInline
          preload="auto"
          disablePictureInPicture
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>

      {muted && (
        <div
          onClick={handleVideoTap}
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            background: "rgba(0,0,0,0.45)",
            color: "#fff",
            zIndex: 25,
            cursor: "pointer",
            WebkitTapHighlightColor: "transparent",
          }}
        >
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "1px solid rgba(255,255,255,0.35)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              animation: "watchSoundPulse 1.6s ease-in-out infinite",
            }}
          >
            <SpeakerIcon />
          </div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: -0.3,
            }}
          >
            Tap for sound
          </div>
          <style>{`
            @keyframes watchSoundPulse {
              0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 rgba(255,255,255,0.35); }
              50% { transform: scale(1.05); box-shadow: 0 0 0 14px rgba(255,255,255,0); }
            }
          `}</style>
        </div>
      )}

      {/* CTA — fixed to viewport bottom, always visible above the video. */}
      <div
        style={{
          position: "fixed",
          left: 0,
          right: 0,
          bottom: 0,
          padding: "16px 25px calc(env(safe-area-inset-bottom) + 20px)",
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,0.65) 40%, rgba(0,0,0,0.9) 100%)",
          zIndex: 30,
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          onClick={handleCta}
          disabled={!ended}
          aria-disabled={!ended}
          style={{
            display: "block",
            position: "relative",
            width: "100%",
            maxWidth: 560,
            margin: "0 auto",
            padding: "18px 0",
            border: "none",
            borderRadius: 40,
            background: ended ? "#fff" : "rgba(255,255,255,0.14)",
            cursor: ended ? "pointer" : "default",
            overflow: "hidden",
            WebkitTapHighlightColor: "transparent",
            outline: "none",
            fontFamily: "inherit",
            lineHeight: "20px",
            transition: "background 200ms ease",
            pointerEvents: "auto",
            backdropFilter: ended ? "none" : "blur(6px)",
            WebkitBackdropFilter: ended ? "none" : "blur(6px)",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              bottom: 0,
              width: `${fillPct}%`,
              background: ended ? "transparent" : "rgba(255,255,255,0.35)",
              transition: "width 120ms linear",
              pointerEvents: "none",
            }}
          />
          <span
            style={{
              position: "relative",
              display: "block",
              width: "100%",
              textAlign: "center",
              fontSize: 16,
              fontWeight: 600,
              color: ended ? "#000" : "#fff",
              zIndex: 1,
            }}
          >
            {ended ? ctaLabel : `${ctaLabel} · ${fillPct}%`}
          </span>
        </button>
      </div>
    </div>
  );
}

function SpeakerIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
    </svg>
  );
}
