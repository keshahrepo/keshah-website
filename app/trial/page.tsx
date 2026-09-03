// keshah.com/trial — test-only route for the inline-checkout redesign.
//
// Standalone during the test period so we can iterate on the layout,
// pricing framing, credibility block, and the reveal-on-Continue card-form
// pattern without touching the live /start funnel. Once the design is
// validated we lift this UI into a new StartStep inside /start and delete
// this route.
//
// Reads quiz answers from localStorage (key `keshah_start_state_v21`, same
// key /start's flow-context persists to). If nothing is persisted — direct
// visit for design iteration — it falls back to sensible defaults so every
// personalized surface still renders correctly.

import type { Metadata } from "next";
import TrialClient from "./TrialClient";

export const metadata: Metadata = {
  title: "Your plan is ready",
  description: "Start your KESHAH trial.",
};

export default function TrialPage() {
  return <TrialClient />;
}
