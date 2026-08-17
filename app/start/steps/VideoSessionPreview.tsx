"use client";

// App-preview slide #2 — in-app video player showing a guided exercise
// session. Anchors the "video-guided" promise from the paywall: the user
// sees Aadi-style demonstration of the exact technique, not a description.

import { useFlow } from "../lib/flow-context";
import { useFunnelConfig } from "../lib/funnel-config";
import { mediumHaptic } from "../lib/haptics";
import startStyles from "../start.module.css";
import frame from "./app-preview.module.css";

export default function VideoSessionPreview() {
  const { next, answers } = useFlow();
  const config = useFunnelConfig();
  const isWomen = config.audience === "women" || answers.gender === "female";
  // Women's funnels show a women-coded scalp-pinching session screenshot;
  // men's keeps the original.
  const screenshot = isWomen
    ? "/start/app/video_session_women.jpg"
    : "/start/app/video_session.jpeg";
  const handleContinue = () => {
    mediumHaptic();
    next();
  };
  return (
    <div className={startStyles.stepBody}>
      <div
        className={startStyles.stepInner}
        style={{
          alignItems: "center",
          textAlign: "center",
          paddingTop: "calc(env(safe-area-inset-top) + 56px)",
        }}
      >
        <p className={frame.label}>HOW IT WORKS</p>
        <h1 className={startStyles.headline} style={{ marginTop: 8, fontSize: 26 }}>
          Video-guided sessions so you learn the correct technique.
        </h1>
        <div className={frame.phone}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={screenshot} alt="KESHAH app — video-guided session" className={frame.screenshot} />
        </div>
      </div>
      <div className={startStyles.buttonRow}>
        <button type="button" className={startStyles.button} onClick={handleContinue}>
          Continue
        </button>
      </div>
    </div>
  );
}
