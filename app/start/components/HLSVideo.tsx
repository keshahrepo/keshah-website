"use client";

// Plays an HLS (.m3u8) stream in HTML5 <video>. Safari/iOS native; other
// browsers via hls.js (loaded dynamically on mount). Used for the
// CustomerResults testimonial cards where the source streams live on the
// same S3/CloudFront the Flutter app uses.

import { useEffect, useRef } from "react";

interface Props {
  src: string;
  poster?: string;
  className?: string;
  style?: React.CSSProperties;
}

export default function HLSVideo({ src, poster, className, style }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;

    // Native HLS support (Safari, iOS Chrome which is Safari under the
    // hood) — just set the src and the browser handles it.
    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = src;
      return;
    }

    // Other browsers — load hls.js dynamically and attach.
    let hls: { destroy: () => void } | null = null;
    let cancelled = false;
    import("hls.js").then((mod) => {
      if (cancelled) return;
      const Hls = mod.default;
      if (Hls.isSupported()) {
        const instance = new Hls();
        instance.loadSource(src);
        instance.attachMedia(video);
        hls = instance;
      }
    });

    return () => {
      cancelled = true;
      if (hls) hls.destroy();
    };
  }, [src]);

  return (
    <video
      ref={ref}
      poster={poster}
      className={className}
      style={style}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      disablePictureInPicture
    />
  );
}
