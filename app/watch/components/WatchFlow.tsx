"use client";

// 4-page ad landing funnel for TikTok top-of-funnel ads.
//
//   1. watchVideo1        — 60s "how the app works" video + filling CTA
//   2. resultScreenshots  — reuses the main app carousel (gender-aware)
//   3. watchVideo2        — 60s "how the 7-day trial works" video + filling CTA
//   4. watchTrialInfo     — 7-day trial explainer + RC checkout
//   5. purchaseSuccess    — post-checkout redemption / app-install handoff
//
// Uses FlowProvider so ResultScreenshots + TrialInfoPage7Day + PurchaseSuccess
// can share updateAnswers/next just like inside /start. Each of the 4 primary
// pages advances via next(); purchaseSuccess is the terminal.

import { FlowProvider, useFlow } from "../../start/lib/flow-context";
import type { StartStep } from "../../start/lib/types";
import ResultScreenshots from "../../start/steps/ResultScreenshots";
import SocialProof from "../../start/steps/SocialProof";
import PurchaseSuccess from "../../start/steps/PurchaseSuccess";
import VideoStep from "./VideoStep";
import TrialInfoPage7Day from "./TrialInfoPage7Day";

const WATCH_STEP_ORDER: StartStep[] = [
  "watchVideo1",
  "resultScreenshots",
  "socialProof",
  "watchVideo2",
  "watchTrialInfo",
  "purchaseSuccess",
];

const STORAGE_KEY = "keshah_watch_state_v1";

const VIDEO_1_SRC = "/watch/how_it_works.mp4";
const VIDEO_2_SRC = "/watch/trial_explainer.mp4";

export default function WatchFlow() {
  return (
    <FlowProvider stepOrder={WATCH_STEP_ORDER} storageKey={STORAGE_KEY}>
      <WatchRouter />
    </FlowProvider>
  );
}

function WatchRouter() {
  const { step, next } = useFlow();

  switch (step) {
    case "watchVideo1":
      return <VideoStep src={VIDEO_1_SRC} onComplete={next} ctaLabel="Continue" />;
    case "resultScreenshots":
      return <ResultScreenshots />;
    case "socialProof":
      return <SocialProof />;
    case "watchVideo2":
      return <VideoStep src={VIDEO_2_SRC} onComplete={next} ctaLabel="Continue" />;
    case "watchTrialInfo":
      return <TrialInfoPage7Day onPurchaseSuccess={next} />;
    case "purchaseSuccess":
      return <PurchaseSuccess />;
    default:
      // Any unexpected step (stale localStorage from a shape change) — reset
      // by rendering step 1. FlowProvider will overwrite persisted state on
      // the next next() call.
      return <VideoStep src={VIDEO_1_SRC} onComplete={next} ctaLabel="See results" />;
  }
}
