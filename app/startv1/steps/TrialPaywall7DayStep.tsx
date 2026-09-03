"use client";

// /start's trial paywall step.
//
// Renders the /trial page's TrialClient — pixel-for-pixel identical to
// the standalone /trial route. Editing /trial updates the paywall
// automatically. TrialClient reads quiz answers from localStorage under
// `keshah_start_state_v21` (same key /start's flow-context writes to) so
// personalization Just Works when reached from inside /start.
//
// The scrollable wrapper is critical: /start's StartFlow shell sets
// `overflow: hidden` on the viewport and expects each step to scroll
// its own content. TrialClient's outer sets min-height: 100dvh which
// would otherwise get clipped by the shell — users couldn't reach the
// Continue CTA. Wrapping in a `overflow-y: auto` container lets the
// step scroll internally like every other /start step.

import TrialClient from "../../trial/TrialClient";

export default function TrialPaywall7DayStep() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        background: "#000",
      }}
    >
      <TrialClient />
    </div>
  );
}
